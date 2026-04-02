# ADR-0052: Blue/Green Stamp Lifecycle Management

## Status

Accepted

## Context

When deploying stamp 002 alongside stamp 001 in swedencentral, we encountered a cascade of issues from attempting to delete and recreate stamps in-place:

- **ARM deployment stack conflicts** — The deployment stack tracks resources by name. Deleting a resource group while the stack still references it causes `DeploymentFailed` errors.
- **Orphaned role assignments** — Deleting an AKS cluster removes the managed identity, but the role assignment persists with a dangling principal ID. ARM then rejects new assignments with `RoleAssignmentExists`.
- **Stale federated credentials** — Each AKS cluster has a unique OIDC issuer URL. Federated credentials on managed identities (cert-manager, external-dns, workload identity) point to the old issuer and must be explicitly deleted.
- **Flux SSH deploy keys** — Each cluster generates a new SSH keypair. The public key must be registered as a GitHub deploy key before Flux can clone.
- **Post-provision steps** — Managed Gateway API enablement (`az aks update --enable-gateway-api`) is not available in the Bicep AKS API and relies on a workflow post-step that may miss new clusters.
- **Front Door origin lifecycle** — Origins cannot be deleted while they're the last origin in a route-attached origin group.

These issues made stamp replacement fragile and error-prone. A structured lifecycle process is needed.

## Decision

### Never delete and recreate a stamp with the same key

Instead, use **blue/green stamp rotation**: create a new stamp alongside the old one, validate, shift traffic, then decommission the old.

### Stamp Lifecycle Phases

```
Phase 1: CREATE        Phase 2: VALIDATE       Phase 3: SHIFT         Phase 4: DECOMMISSION
───────────────────    ──────────────────────   ─────────────────────  ────────────────────────
Add stamp key to       Verify:                  Update Front Door:     Remove stamp from Bicep
Bicep regions array    - AKS healthy            - Enable new origin    Clean up:
                       - Flux reconciled        - Disable old origin   - Federated credentials
azd provision          - cert-manager ready     - Wait for drain       - Deploy keys
                       - Apps deployed                                 - Role assignments
Register deploy key    - Health probes pass     Verify:                - Resource group
                                                - No 5xx errors        - Front Door origins
Enable Gateway API     Run E2E tests against    - Latency OK
                       new stamp directly
```

### Phase 1: Create New Stamp

1. Add new stamp key to `regions` in `main.bicep` (or `main.prod.bicepparam`)
2. Run `azd provision` — creates RG, AKS cluster, Flux config, Front Door origins
3. Register Flux SSH deploy key: `az k8s-configuration flux show ... --query repositoryPublicKey` → `gh repo deploy-key add`
4. Enable Managed Gateway API: `az aks update --enable-gateway-api`
5. Wait for Flux to reconcile: cert-manager, external-dns, app deployments

### Phase 2: Validate

1. Verify all pods healthy: `kubectl get deployments --all-namespaces`
2. Verify Flux kustomizations ready: `kubectl get kustomizations -n flux-system`
3. Verify cert-manager issued certificates: `kubectl get certificates --all-namespaces`
4. Test apps directly via stamp origin hostname (bypass Front Door)

### Phase 3: Shift Traffic

1. Front Door automatically load-balances across origins in the same origin group
2. To drain the old stamp: disable the old origin via Azure Portal or CLI
3. Monitor for errors during drain period
4. Once stable, proceed to decommission

### Phase 4: Decommission Old Stamp

Execute in this order to avoid dependency conflicts:

```bash
# 1. Remove old origins from Front Door (for each app)
az afd origin delete --profile-name fd-alwayson --origin-group-name og-{app} \
  --origin-name origin-{region}-{old-key} -g rg-alwayson-global --yes

# 2. Remove Flux deploy key from GitHub
gh repo deploy-key list --repo owner/repo | grep {old-key}
gh repo deploy-key delete --repo owner/repo {key-id}

# 3. Delete federated credentials (for each identity)
for identity in id-playeronlevel0 id-helloorleons id-darkuxchallenge id-certmanager; do
  az identity federated-credential delete \
    --identity-name ${identity}-alwayson \
    -g rg-alwayson-{region-or-global} \
    --name "*-{region}-{old-key}" --yes
done

# 4. Delete orphaned role assignments
az role assignment list --all --query "[?principalName=='']" -o json
# For each orphaned: az rest --method DELETE --url {assignment-id}

# 5. Remove stamp from Bicep regions array
# Edit main.bicep or main.prod.bicepparam

# 6. Delete the resource group (this deletes AKS + all stamp resources)
az group delete --name rg-alwayson-{region}-{old-key} --yes --no-wait

# 7. Run azd provision to update deployment stack
azd provision
```

### Naming Convention

Stamps use incrementing numeric keys: `001`, `002`, `003`, etc. Never reuse a key — always increment. This avoids ARM deployment cache conflicts and makes audit trails clear.

## Consequences

- Stamp rotation is safe — no downtime, no race conditions with ARM
- Old stamps can run indefinitely during validation (no time pressure)
- Decommission is explicit and ordered — no orphaned resources
- Front Door provides zero-downtime traffic shifting
- Higher cost during overlap period (two stamps running simultaneously)
- The `azure-dev.yml` workflow's deploy key registration step should handle multiple stamps automatically

## References

- ADR-0051 (CI/CD deployment lessons)
- Commits: `89d2739` (parallel stamps), `974a6c8` (Flux vars fix), `e908255` (Istio revision fix)
- Azure Deployment Stacks: `actionOnUnmanage: detach` prevents accidental deletion but complicates cleanup
