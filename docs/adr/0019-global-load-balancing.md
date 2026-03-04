# ADR-0019: Global Load Balancing

## Status

Proposed

## Context

Multi-region active-active deployment requires a global load balancer that routes users to the nearest healthy region, provides automatic failover, and supports TLS termination and WAF.

## Options Considered

### Option 1: Azure Front Door Premium

Anycast + L7 routing with full WAF, DDoS protection, and Private Link support.

- **Pros**: Best Azure-native option; sub-second failover (~1–2s); built-in WAF with OWASP Top 10 rule sets; managed TLS certificates; Private Link for secure backend connectivity.
- **Cons**: Premium tier cost is significant for multi-region deployment.

### Option 2: Azure Front Door Standard

Anycast + L7 routing with basic DDoS protection.

- **Pros**: Lower cost than Premium; still provides anycast routing and automatic failover; managed TLS.
- **Cons**: No advanced WAF rules; limited Private Link support.

### Option 3: Azure Traffic Manager

DNS-based global routing only.

- **Pros**: Low cost (~$0.05 per million queries); simple configuration.
- **Cons**: No L7 features (no WAF, no header rewriting, no caching); slow failover (~30–60s) due to DNS TTL propagation.

### Option 4: Application Gateway + Traffic Manager

Per-region L7 load balancer (Application Gateway) with global DNS routing (Traffic Manager).

- **Pros**: WAF per region via Application Gateway; regional L7 features.
- **Cons**: Complex multi-layer architecture; slow DNS-based global failover; higher operational overhead.

### Option 5: Cross-Region Azure Load Balancer

L4 (TCP/UDP) load balancing across regions.

- **Pros**: Low cost; fast failover; simple configuration.
- **Cons**: No WAF; no TLS termination; no L7 routing features.

### Option 6: Cloudflare

Third-party anycast CDN with advanced DDoS protection.

- **Pros**: Excellent DDoS protection; cost-effective; fast failover (~3–5s); global edge network.
- **Cons**: Vendor dependency outside Azure ecosystem; data sovereignty considerations.

### Option 7: Kubernetes-Native Multi-Cluster (Submariner / Istio)

Service mesh routing across multiple Kubernetes clusters.

- **Pros**: Kubernetes-native; no external load balancer needed; service-level routing.
- **Cons**: No geolocation routing; complex networking setup; limited to Kubernetes workloads.

## Decision Criteria

- Failover speed requirements
- WAF and DDoS protection requirements
- TLS termination needs
- Azure-native preference
- Cost constraints
- Operational complexity tolerance

## References

- [Azure Front Door Overview](https://learn.microsoft.com/azure/frontdoor/front-door-overview)
- [Front Door + AKS Integration](https://learn.microsoft.com/azure/frontdoor/integrate-with-kubernetes)
- [Azure Traffic Manager Overview](https://learn.microsoft.com/azure/traffic-manager/traffic-manager-overview)
