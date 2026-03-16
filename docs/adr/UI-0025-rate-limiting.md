# ADR-0025: Rate Limiting

## Status

Proposed

## Context

At 10,000+ TPS with hundreds of thousands of players, the API needs protection against abuse, DDoS, and fair resource allocation. Rate limiting can be applied at multiple layers with different trade-offs.

## Options Considered

### Option 1: Azure Front Door Rate Limiting

WAF custom rules applied at the edge (Azure Front Door).

- **Pros**: Edge-level protection before traffic reaches the backend; no application changes needed; absorbs volumetric attacks at the CDN layer.
- **Cons**: Limited granularity (primarily IP-based); cannot rate-limit per authenticated user; custom rule limits per WAF policy.

### Option 2: Azure API Management Rate Limiting

Throttling policies per subscription key, IP, or custom header in Azure API Management (APIM).

- **Pros**: Fine-grained control (per-key, per-IP, per-endpoint); built-in analytics and developer portal; supports burst and sustained rate limits.
- **Cons**: Adds latency (additional hop); additional service cost; APIM is a significant operational component.

### Option 3: ASP.NET Core Rate Limiting Middleware

Built-in middleware (`Microsoft.AspNetCore.RateLimiting`) with token bucket, sliding window, fixed window, and concurrency limiter algorithms.

- **Pros**: Per-endpoint configuration; runs in-process (low latency); no external dependencies; supports partitioning by user/IP/custom key.
- **Cons**: Per-pod only (no distributed state); each pod tracks its own counters independently; not accurate for cluster-wide rate limits.

### Option 4: Redis-Backed Distributed Rate Limiting

Shared rate limit counters in Redis across all pods and regions.

- **Pros**: Accurate distributed counting; cluster-wide rate limits; supports sliding window with Redis sorted sets.
- **Cons**: Redis dependency for every request; added latency for Redis round-trip; Redis failure can block or bypass rate limiting.

### Option 5: Orleans Grain-Level Rate Limiting

Per-player rate limit enforced within the player grain.

- **Pros**: Natural fit for Orleans architecture; rate limit state is per-grain (per-player); no external dependencies; in-process enforcement.
- **Cons**: Custom implementation needed; only applies to grain-routed requests; does not protect unauthenticated endpoints.

### Option 6: No Rate Limiting

Rely on AKS cluster autoscaler and Cosmos DB autoscale to absorb traffic.

- **Pros**: Simplest; no rate limiting infrastructure; autoscaling handles legitimate traffic spikes.
- **Cons**: No protection against abuse or DDoS; runaway costs from autoscaling in response to attacks; unfair resource allocation between players.

## Decision Criteria

- Granularity needed (global vs. per-IP vs. per-player)
- Latency budget (edge vs. in-process vs. external store)
- Distributed vs. per-pod accuracy requirements
- Abuse and DDoS protection requirements
- Integration with existing architecture (Front Door, Orleans, AKS)

## References

- [ASP.NET Core Rate Limiting](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [Azure Front Door WAF Custom Rules](https://learn.microsoft.com/azure/web-application-firewall/afds/waf-front-door-custom-rules)
- [Azure API Management Throttling](https://learn.microsoft.com/azure/api-management/api-management-sample-flexible-throttling)
