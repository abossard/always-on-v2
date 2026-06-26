# CI/CD, GitOps & Production Topology

Everything in this folder is **optional** for trying the sample. If you just want to run
it, follow the [root README](../README.md) — `azd up` deploys the whole platform from your
laptop with no Git repo, no Flux, and no GitHub Actions.

This document covers the production path:

- [GitHub Actions workflows](#github-actions-workflows)
- [One-time OIDC setup](#one-time-oidc-setup)
- [Flux GitOps](#flux-gitops)
- [Deploy-key setup](#deploy-key-setup)
- [Running a deployment](#running-a-deployment)
- [Production profiles & environment switching](#production-profiles--environment-switching)

> **Why aren't the files in this folder?** Two CI/CD concerns must stay where the tools
> expect them:
> - **GitHub Actions** workflow YAML must live in [`.github/workflows/`](../.github/workflows/) — GitHub only runs workflows from that path.
> - **Flux** manifests must live in [`clusters/`](../clusters/) — the `fluxConfiguration` reconciles `clusters/<region>/infra` and `clusters/<region>/apps`, and the `azd` `postdeploy` hook renders the same paths in Flux-free mode.
>
> This folder is the **documentation home** for those concerns; it links to the files in place.

---

## GitHub Actions workflows

Located in [`.github/workflows/`](../.github/workflows/):

| Workflow | Trigger | What it does |
|---|---|---|
| [`darkux-cicd.yml`](../.github/workflows/darkux-cicd.yml) | Push to `src/DarkUxChallenge/**` | Build → TUnit (3× retry) → E2E → Docker build+push → Flux deploys |
| [`helloagents-cicd.yml`](../.github/workflows/helloagents-cicd.yml) | Push to `src/HelloAgents/**` | Build → TUnit (3× retry) → E2E → Docker build+push → Flux deploys |
| [`graphorleons-cicd.yml`](../.github/workflows/graphorleons-cicd.yml) | Push to `src/GraphOrleons/**` | Build → TUnit (3× retry) → E2E → Docker build+push → Flux deploys |
| [`helloorleons-cicd.yml`](../.github/workflows/helloorleons-cicd.yml) | Push to `src/HelloOrleons/**` | Build → TUnit (3× retry) → Docker build+push → Flux deploys |
| [`app-build-push.yml`](../.github/workflows/app-build-push.yml) | Reusable (called by above) | Multi-arch Docker build (amd64/arm64 native), ACR push, manifest update |
| [`app-e2e-aspire.yml`](../.github/workflows/app-e2e-aspire.yml) | Reusable | Aspire-hosted E2E with the Cosmos emulator |
| [`app-verify-deploy.yml`](../.github/workflows/app-verify-deploy.yml) | Reusable | Post-deploy rollout + health verification |
| [`azure-dev.yml`](../.github/workflows/azure-dev.yml) | Manual dispatch | `azd provision` + `azd deploy` for infrastructure |
| [`healthmodel-drift.yml`](../.github/workflows/healthmodel-drift.yml) | Schedule / manual | Detects drift in the generated `healthmodel.bicep` |

Key features: **OIDC authentication** (no stored secrets), **multi-arch native builds**
(no QEMU), **test retry** for the flaky Cosmos emulator, and **Flux image automation** for
GitOps delivery.

---

## One-time OIDC setup

Infrastructure is deployed via the `azure-dev.yml` workflow using `azd` with OIDC
federated credentials — no secrets stored in GitHub.

### Option A — automated (recommended)

```bash
azd auth login
azd pipeline config --provider github
```

This creates the Entra app registration, federated credentials, and sets the required
GitHub variables automatically.

### Option B — manual

1. Create an Entra ID app registration with a federated credential for GitHub Actions:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<org>/<repo>:environment:dev` (repeat for `prod`)
2. Grant the app **Contributor** + **User Access Administrator** on your subscription.
3. Set these **GitHub Environment variables** on each environment (`dev`, `prod`):

   | Variable | Value |
   |---|---|
   | `AZURE_CLIENT_ID` | App registration Client ID |
   | `AZURE_ENV_NAME` | e.g. `alwayson-dev` or `alwayson-prod` |
   | `AZURE_LOCATION` | e.g. `swedencentral` |

4. Set these **repository-level variables** (shared across environments):

   | Variable | Value |
   |---|---|
   | `AZURE_TENANT_ID` | Your Entra tenant ID |
   | `AZURE_SUBSCRIPTION_ID` | Target subscription ID |

5. Add a **required reviewer** to the `prod` GitHub Environment for approval gates.

---

## Flux GitOps

GitOps is **distributed per cluster** — there is no Fleet hub in the steady-state
reconciliation path.

- `azd provision` / `azd up` deploys each AKS stamp.
- [`infra/stamp.bicep`](../infra/stamp.bicep) installs the Azure-managed Flux extension
  (`microsoft.flux`) and creates a `fluxConfiguration` named `cluster-config`.
- Each cluster pulls and reconciles its own paths from Git:
  - `clusters/<region>/infra`
  - `clusters/<region>/apps`

Flux is **off by default** (`enableFlux = false` in
[`infra/main.parameters.json`](../infra/main.parameters.json)). Enable it for the GitOps
path by setting `enableFlux = true`.

### Changing the Git source

The repository Flux syncs from is the `fluxGitRepoUrl` parameter in
[`infra/main.bicep`](../infra/main.bicep) (default: an SSH GitHub URL). To point clusters
at a different repo:

- change `fluxGitRepoUrl`;
- ensure the target repo has the `clusters/<region>/infra` and `clusters/<region>/apps`
  layout;
- ensure Flux can authenticate if the repo is private (see deploy keys below);
- redeploy so the `fluxConfiguration` resources update on the clusters.

This does not require Azure Kubernetes Fleet — the Bicep owns the per-cluster Git source.
Fleet can be added later for mass orchestration across many clusters, but it is a separate
concern and not how this repo wires GitOps today.

---

## Deploy-key setup

When Flux is enabled, each AKS stamp gets a Flux configuration that syncs from this repo
via SSH. Flux auto-generates an SSH key pair per stamp. To grant Flux read access,
register the public keys as **read-only deploy keys**.

### Automated (recommended)

1. Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with:
   - **Repository access**: only this repo
   - **Permissions**: Administration → Read and write
2. Add it as a repo secret named `DEPLOY_KEY_ADMIN_TOKEN`:
   ```bash
   gh secret set DEPLOY_KEY_ADMIN_TOKEN
   ```
3. The provision workflow then registers the deploy keys automatically after each provision.

### Manual fallback

If no PAT is configured, the workflow prints the SSH public keys to the **workflow run
summary**. Copy each key and add it under **Settings → Deploy keys → Add deploy key**
(read-only).

---

## Running a deployment

Trigger the [`azure-dev.yml`](../.github/workflows/azure-dev.yml) workflow
(**Actions → Run workflow**) to run `azd provision` + `azd deploy` from CI using the OIDC
credentials configured above. Production topology (stamp count, region spread, SKUs) is
controlled by the active `var env` profile in `main.prod.bicepparam` — see the next
section. Gate production behind a GitHub Environment with a required reviewer.

---

## Production profiles & environment switching

The `azd` getting-started path uses [`infra/main.parameters.json`](../infra/main.parameters.json)
(explicit `regions` array — see the [README deploy section](../README.md#deploy-with-azure-developer-cli-azd)).

The **production path** uses [`infra/main.prod.bicepparam`](../infra/main.prod.bicepparam),
which defines reusable **stamp profiles** (`normalStamp`, `budgetStamp`) and **environment
configs** (`dev`, `budget`, `budgetDual`) — Front Door SKU, Cosmos mode, Event Hubs SKU,
log retention, and the `regions` array. The active config is selected by one line:

```bicep
var env = budgetDual  // switch between: dev | budget | budgetDual
```

The two parameter files are consumed by **different tools** (this is by design — see the
comment in `main.prod.bicepparam`):

| File | Consumed by | `baseName` |
|---|---|---|
| [`infra/main.parameters.json`](../infra/main.parameters.json) | `azd up` / `azd provision` | `${AZURE_ENV_NAME}` (per-env isolation) |
| [`infra/main.prod.bicepparam`](../infra/main.prod.bicepparam) | GitHub Actions (`az stack sub create --parameters main.prod.bicepparam`) | hardcoded `alwayson` |

> There is **no `infra/main.bicepparam`** in the repo. `azd` reads
> `infra/main.parameters.json`; the production profiles in `main.prod.bicepparam` are
> applied through the GitHub Actions deployment-stack path, not through `azd`. To change
> the production topology, edit `var env` (or the profile `vars`) in
> `main.prod.bicepparam` and run the `azure-dev.yml` workflow.

### `azd up` vs GitHub Actions

Both methods use the same Bicep templates but are **independent**:

| | `azd up` | GitHub Actions |
|---|---|---|
| **Mechanism** | `azd provision` (ARM deployment) | `az stack sub create` (deployment stacks) |
| **Resource naming** | `baseName` = azd env name | `baseName` = `alwayson` |
| **Resource groups** | `rg-{env-name}-*` | `rg-alwayson-*` |
| **When to use** | Local dev/demo, no Git repo needed | CI/CD, production, GitOps |

They target **different resource groups** as long as the azd env name differs from
`alwayson`.
