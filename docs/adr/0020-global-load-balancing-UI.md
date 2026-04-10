# ADR-0020: Global Load Balancing

**Status:** Under Investigation

## Context
- Multi-region active-active needs global load balancing with nearest-region routing, auto-failover, TLS termination, and WAF

## Options Under Consideration
- **Azure Front Door Premium** — Anycast L7, sub-second failover, full WAF, Private Link. Cons: significant cost
- **Azure Front Door Standard** — Anycast L7, lower cost, managed TLS. Cons: no advanced WAF, limited Private Link
- **Azure Traffic Manager** — DNS-based only, ~$0.05/M queries. Cons: no L7 features, 30–60s failover
- **App Gateway + Traffic Manager** — Per-region WAF + global DNS routing. Cons: complex, slow DNS failover
- **Cross-Region Azure LB** — L4 TCP/UDP, fast failover, cheap. Cons: no WAF, no TLS termination
- **Cloudflare** — Excellent DDoS, cost-effective, 3–5s failover. Cons: vendor dependency outside Azure
- **K8s-native multi-cluster (Submariner/Istio)** — Service mesh routing. Cons: no geo routing, complex networking

## Decision Criteria
- Failover speed, WAF/DDoS requirements, TLS termination, Azure-native preference, cost, complexity

## Links
- [Azure Front Door](https://learn.microsoft.com/azure/frontdoor/front-door-overview)
- [Front Door + AKS](https://learn.microsoft.com/azure/frontdoor/integrate-with-kubernetes)
- [Traffic Manager](https://learn.microsoft.com/azure/traffic-manager/traffic-manager-overview)
