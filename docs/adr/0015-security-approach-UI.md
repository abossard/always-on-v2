# ADR-0015: Security Approach

## Status

Proposed

## Context

A mission-critical production system requires comprehensive security covering identity, network, data, and runtime layers. The approach must follow Azure Well-Architected Framework security principles and support zero-trust networking. Options are presented per security dimension.

## Options Under Consideration

### Identity & Authentication to Azure Services

#### Option 1: Azure Workload Identity (OIDC)

CNCF-standard OIDC federation for pod-to-Azure-service authentication. No secrets stored.

- **Pros**: Zero secrets in cluster; CNCF standard; fine-grained per-pod identity; Microsoft-recommended replacement for pod identity.
- **Cons**: Setup complexity (federated credentials, service account annotations); requires understanding of OIDC token exchange.

#### Option 2: AAD Pod Identity (Legacy)

Azure AD pod-managed identity using NMI (Node Managed Identity) daemon.

- **Pros**: Established pattern with existing documentation.
- **Cons**: Deprecated by Microsoft; NMI daemon intercepts all IMDS traffic (security risk); higher latency for token acquisition; no longer receiving updates.

#### Option 3: Service Principal with Secrets

Traditional client ID + client secret stored in Key Vault or Kubernetes secrets.

- **Pros**: Simplest to set up; widely understood; works everywhere.
- **Cons**: Violates zero-trust principles; secret rotation burden; secrets can leak via environment variables or logs.

#### Option 4: Managed Identity (System/User-Assigned)

Node-level managed identity where Azure manages the credential lifecycle.

- **Pros**: Azure manages credential lifecycle; no secrets to rotate; straightforward Azure integration.
- **Cons**: Coarse-grained (node-level, not pod-level); shared identity across all pods on a node; less granular than Workload Identity.

### Network Security

#### Option 1: Private Endpoints

Azure Private Link endpoints for Cosmos DB, Service Bus, Redis, and Key Vault — no internet exposure.

- **Pros**: Data services never exposed to public internet; traffic stays on Azure backbone; strongest network isolation.
- **Cons**: DNS private zone complexity; VNet peering requirements; developers need VPN or bastion for access.

#### Option 2: Service Endpoints

VNet service endpoints that route traffic to Azure services over the Azure backbone.

- **Pros**: Free; simpler configuration than private endpoints; traffic stays on Azure backbone.
- **Cons**: Service still has a public IP (restricted by ACL); less isolation than private endpoints.

#### Option 3: Network Policies (Azure vs Calico)

Pod-to-pod traffic filtering within the AKS cluster.

- **Azure Network Policies**: Native AKS integration; simpler. Cons: limited policy expressiveness.
- **Calico Network Policies**: More expressive rules (DNS-based, application-layer). Cons: additional component to manage.

#### Option 4: Azure Firewall

Centralized egress filtering and logging for all outbound cluster traffic.

- **Pros**: Centralized policy enforcement; full traffic logging; threat intelligence integration.
- **Cons**: Adds latency to egress traffic; cost (~$1.25+/hour); can become a bottleneck.

#### Option 5: Service Mesh mTLS (Istio/Linkerd)

Automatic mutual TLS encryption for all pod-to-pod communication.

- **Pros**: Zero-trust within the cluster; automatic certificate rotation; traffic observability.
- **Cons**: 15–30% latency increase for proxied traffic; significant operational overhead; resource consumption for sidecar proxies.

### Container Security

#### Base Image Options

##### Option 1: Distroless/Chiseled Images

Minimal Ubuntu-based images with no shell, no package manager, non-root by default.

- **Pros**: Smallest attack surface; fewest CVEs; non-root native.
- **Cons**: No shell access for debugging (requires `kubectl debug` with ephemeral containers).

##### Option 2: Alpine-Based Images

Lightweight Linux distribution with musl libc.

- **Pros**: Small image size; fewer CVEs than full distributions; shell available for debugging.
- **Cons**: musl libc compatibility issues with some .NET workloads; different behavior from glibc.

##### Option 3: Full Base (Debian/Ubuntu)

Standard distribution base images with full package ecosystem.

- **Pros**: Maximum compatibility; familiar tooling; easiest debugging.
- **Cons**: Larger image size; more CVEs to patch; wider attack surface.

#### Pod Security Standards

- **Restricted**: Most secure — non-root, read-only root filesystem, no privilege escalation, no host namespaces.
- **Baseline**: Moderate — prevents known privilege escalations while allowing broader workload compatibility.
- **Privileged**: Least restrictive — unrestricted policy; not suitable for production workloads.

#### Image Scanning Options

- **Microsoft Defender for Containers**: Azure-native; integrated with ACR and AKS; automatic scanning.
- **Trivy**: Open-source; free; broad vulnerability database; CI/CD friendly.
- **Snyk**: Commercial; developer-focused; license compliance; fix suggestions.

### Data Protection

#### Encryption at Rest

##### Option 1: Azure-Managed Keys

Azure automatically manages encryption keys for all data services.

- **Pros**: Zero operational overhead; enabled by default; no key management required.
- **Cons**: No control over key rotation schedule; keys shared across Azure infrastructure.

##### Option 2: Customer-Managed Keys (CMK)

Encryption keys stored and managed in Azure Key Vault under customer control.

- **Pros**: Full control over key lifecycle; can revoke access; meets strict compliance requirements.
- **Cons**: Key management operational burden; risk of data inaccessibility if keys are lost or deleted.

#### Encryption in Transit

- **TLS 1.2**: Widely supported across all Azure services; current industry standard.
- **TLS 1.3**: Faster handshake; improved security; but some Azure services only support TLS 1.2 currently.

## Decision Criteria

- **Compliance requirements**: What regulatory or organizational security standards must be met?
- **Zero-trust maturity**: How far along the zero-trust journey is the organization?
- **Operational complexity appetite**: How much security infrastructure overhead is acceptable?
- **Cost**: What is the budget for security tooling and infrastructure?
- **Development workflow impact**: How much friction does the security approach add to the development inner loop?

## References

- [Azure Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [Azure Private Link](https://learn.microsoft.com/azure/private-link/private-link-overview)
- [AKS Security Best Practices](https://learn.microsoft.com/azure/aks/operator-best-practices-cluster-security)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Microsoft Defender for Containers](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-containers-introduction)
