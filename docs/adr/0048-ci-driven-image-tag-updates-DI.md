# ADR-0048: CI-Driven Image Tag Updates (Not Flux Image Automation)

## Status

Accepted

## Context

We initially used Flux Image Automation (`ImageUpdateAutomation`) to detect new container images in ACR and automatically commit updated tags back to Git. This approach had three problems in our multi-cluster setup:

1. **Multi-cluster conflict**: With N clusters each running image automation, all would try to push the same tag update concurrently — causing Git conflicts, failed pushes, and commit storms.
2. **Git write access**: Flux deploy keys needed read-write access to the repo, increasing the security surface. Read-only deploy keys are preferred.
3. **Primary cluster dependency**: Designating a single "writer" cluster creates an availability gap — if that cluster/region goes down, no image updates get committed until manual failover.

## Decision

**CI pipeline commits image tag updates to Git**, not Flux. The flow:

```
CI builds image → pushes to ACR with <timestamp>-<sha> tag
  → CI updates clusters/base/apps/level0/deployment.yaml with new tag
  → CI commits with [skip ci] marker → pushes to main
  → All clusters pick up the change via normal Flux Git sync (read-only)
```

### Implementation Details

- **CI step**: After pushing images to ACR, `sed` replaces the tag in `deployment.yaml`
- **Commit message**: Includes `[skip ci]` to prevent re-triggering CI
- **Path safety**: CI only triggers on `src/PlayersOnLevel0/**` — the manifest is in `clusters/` so even without `[skip ci]`, no loop occurs
- **Permissions**: `contents: write` on the CI workflow for `GITHUB_TOKEN` to push
- **Flux deploy keys**: Remain **read-only** (more secure)

### What was removed

- `ImageUpdateAutomation` CRD from `image-automation.yaml`
- Flux setter comments (`# {"$imagepolicy": ...}`) from deployment.yaml
- Read-write deploy key requirement

### What was kept

- `ImageRepository` + `ImagePolicy` — still useful for visibility into available tags via `kubectl get imagepolicies`
- `useKubeletIdentity` — still needed for ImageRepository to scan ACR

## Alternatives Considered

### 1. Flux Image Automation (single writer cluster)

- **Pros**: Pure GitOps, no CI needs Git write access
- **Cons**: One cluster must be designated as writer. If that region goes down, no updates. Multiple writers cause Git conflicts.
- **Rejected**: Availability and multi-cluster safety concerns

### 2. Flux Image Automation with leader election

- **Pros**: Automatic failover between clusters
- **Cons**: Flux has no built-in leader election for image automation. Requires external tooling (operators, cloud functions) to manage.
- **Rejected**: Too complex for the benefit

### 3. Kustomize `images` field in kustomization.yaml

- **Pros**: YAML-safe, kustomize-native
- **Cons**: Doesn't work cleanly with Flux `${ACR_LOGIN_SERVER}` substitution vars in image names. The `images` field needs the full image name at build time.
- **Rejected**: Incompatible with Flux postBuild substitution

### 4. `yq` instead of `sed`

- **Pros**: YAML-aware, safer for complex manifests
- **Cons**: Extra dependency in CI. Our replacement is simple (tag only, after known prefix).
- **Considered**: Could be adopted if manifests become more complex. `sed` is sufficient for now.

## Consequences

### Positive

- **Multi-cluster safe**: All clusters are read-only Git consumers. No conflicts.
- **Region-independent**: CI is external to clusters. Any region can go down.
- **More secure**: Flux deploy keys are read-only.
- **Simpler**: No ImageUpdateAutomation CRDs, no Git write from clusters.
- **Faster**: CI updates the manifest in the same run as the image push — no 1-minute scan interval.

### Negative

- **CI has Git write access**: `GITHUB_TOKEN` with `contents: write`. Mitigated by GitHub's automatic token scoping and expiry.
- **CI availability**: If GitHub Actions is down, no tag updates. Mitigated by GitHub's SLA and manual fallback.
- **Two pushes per deploy**: One for the code change (triggering CI), one for the manifest update (`[skip ci]`). Clean Git history with clear separation.

## References

- [GitHub Actions: Skipping workflow runs](https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs) — `[skip ci]` documentation
- [Flux Image Update Guide](https://fluxcd.io/flux/guides/image-update/) — the approach we moved away from
- [Flux Multi-cluster Architecture](https://stefanprodan.com/blog/2024/fluxcd-multi-cluster-architecture/) — single-writer limitations
- [Flux Image Automation Discussion #107](https://github.com/fluxcd/flux2/discussions/107) — community discussion on multi-cluster challenges
- [Automatic Image Update with GitHub Actions](https://www.infracloud.io/blogs/automatic-image-update-to-git-using-flux-github-actions/) — CI-driven approach reference
- `.github/workflows/level0-cicd.yml` — "Update K8s manifests" step
- `clusters/base/apps/level0/image-automation.yaml` — ImageRepository + ImagePolicy (kept), ImageUpdateAutomation (removed)
