# ADR-0031: IaC Placement of Service Connector Wiring

## Status

Proposed

## Context

ADR-0030 decided on Azure Service Connector to automate the identity chain between AKS workloads and backing services. An open question remains: **where in the IaC layering do the `Microsoft.ServiceLinker/linkers` declarations live, and how does Kubernetes-level context (namespace, service account name) flow into the Bicep layer?**

The current infra layout is:

| File | Scope |
|---|---|
| `global.bicep` | Single-instance global resources (Front Door, ACR, Fleet, DNS) |
| `region.bicep` | Per-region resources (VNet, DNS child zone) |
| `stamp.bicep` | Per-stamp resources (AKS, Cosmos, Redis, Service Bus) |
| `wiring.bicep` | Cross-RG stitching (fleet membership, ACR pull role, DNS delegation) |

Service Connector linkers need:
- **AKS cluster resource ID** — known at stamp deploy time
- **Target resource IDs** (Cosmos, Service Bus, etc.) — known at stamp deploy time
- **Kubernetes namespace** — known only at app deployment time
- **Service account name** — known only at app deployment time

This creates a **layer-crossing dependency**: Bicep (infra layer) must know K8s-level details (app layer).

## Options Considered

### Option 1: Declare in `wiring.bicep`

Add `Microsoft.ServiceLinker/linkers` to `wiring.bicep` with `workloadNamespace` and `serviceAccountName` as params.

- **Pros**: Consistent with existing cross-domain wiring pattern; all identity plumbing in one place; deployed with infra.
- **Cons**: Infra layer now coupled to app deployment details (namespace, SA name); namespace changes require infra redeploy; param explosion if multiple apps/namespaces per stamp.

### Option 2: Declare in `stamp.bicep`

Linkers co-located with the AKS cluster and backing resources they connect.

- **Pros**: Linker close to the resources it wires; fewer cross-module references.
- **Cons**: Same layer-crossing problem as Option 1; stamp.bicep already large; still needs K8s namespace as input.

### Option 3: Separate `app-wiring.bicep` Module

New module deployed **after** stamp infra, parameterized with both infra outputs and app-level inputs (namespace, SA name).

- **Pros**: Clean separation — infra deploys first, app-wiring deploys second with K8s context; can be triggered from the app CI/CD pipeline; multiple apps can each have their own wiring module.
- **Cons**: Additional deployment stage; ordering dependency (infra must complete first); more files to maintain.

### Option 4: Imperative `az aks connection create` in CI/CD

Skip Bicep entirely; run CLI commands during app deployment pipeline.

- **Pros**: K8s context naturally available in the pipeline deploying the app; no layer-crossing in IaC; simple to prototype.
- **Cons**: Imperative — not in IaC state; drift risk; harder to audit; violates ADR-0011 IaC principle; no `what-if` preview.

### Option 5: Helm Post-Install Hook

Use a Helm hook that calls the Azure REST API or `az` CLI to create the linker after the app namespace/SA exist.

- **Pros**: Wiring happens alongside app deployment; K8s context is native.
- **Cons**: Same imperative problems as Option 4; Helm hooks are fragile; retry/idempotency is hard; needs Azure credentials in the cluster.

## Open Questions

- How many distinct workloads/namespaces exist per stamp? (If just one, Options 1/2 are simpler. If many, Option 3 scales better.)
- Should namespace names be considered stable infra-level constants or app-team-owned variables?
- Can Service Connector linkers be updated in-place, or do namespace changes require delete + recreate?

## Decision

**Undecided.** Leaning toward Option 1 (`wiring.bicep`) if namespaces are stable per stamp, or Option 3 (`app-wiring.bicep`) if multiple apps with different namespaces share a stamp.

## References

- [Microsoft.ServiceLinker/linkers Bicep](https://learn.microsoft.com/azure/templates/microsoft.servicelinker/linkers)
- [Service Connector for AKS](https://learn.microsoft.com/azure/service-connector/how-to-use-service-connector-in-aks)
- Related: [ADR-0030 Service Identity Wiring](0030-service-identity-wiring-UI.md), [ADR-0011 Infrastructure as Code](0011-infrastructure-as-code-UI.md)
