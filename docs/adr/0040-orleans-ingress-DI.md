# ADR-0040: Orleans Ingress — Front Door Direct to Internal Load Balancer

## Status

Accepted

## Context

The typical AKS ingress pattern is: **Front Door → NGINX Ingress Controller → Pod**. This makes sense for stateless microservices where NGINX provides L7 routing (path-based, host-based), SSL termination, and rate limiting between the edge and the pod.

Orleans fundamentally changes this equation. The Orleans runtime does all the load balancing internally — it's one of the pillars of the runtime. The runtime keeps everything balanced to maximize resource usage and avoid hotspots. Putting a load balancer between clients and the cluster works against this core purpose.

Our architecture co-hosts ASP.NET Core and the Orleans silo in the same process ([ADR-0003](0003-application-framework-DI.md)). When the client code runs in the same process as grain code, it communicates directly with the silo and uses the silo's knowledge of cluster topology. This eliminates a network hop and a serialization/deserialization round trip. The co-hosted client doesn't need a separate gateway.

Meanwhile, Azure Front Door ([ADR-0020](0020-global-load-balancing-UI.md)) already provides all the L7 concerns we need at the edge: WAF, SSL termination, CDN caching, path-based routing, and global anycast. Adding NGINX between Front Door and the pods duplicates these L7 features without adding value.

## Decision

### 1. Co-host ASP.NET Core + Orleans Silo in Every Pod

Each pod runs a single process containing both Kestrel (HTTP) and an Orleans silo. This is the Orleans-recommended approach:

```
┌─────────────────────────────┐
│ Pod                         │
│  ASP.NET Core (Kestrel)     │ ← HTTP port 8080
│  Orleans Silo               │ ← Silo port 11111 (cluster-internal)
│  Orleans Gateway             │ ← Gateway port 30000 (cluster-internal)
└─────────────────────────────┘
```

The ASP.NET controller or minimal API endpoint injects `IGrainFactory` and calls grains directly. Because it runs in-process with the silo, it uses the silo's cluster topology to route grain calls to the correct silo — no external routing needed.

```csharp
// Program.cs — co-hosted setup
builder.Host.UseOrleans(silo =>
{
    silo.UseKubernetesHosting();  // discover silos via k8s API
    silo.UseAzureStorageClustering(options => { ... });
});

// Endpoint — calls grains directly via co-hosted client
app.MapGet("/players/{id}", async (string id, IGrainFactory grains) =>
{
    var grain = grains.GetGrain<IPlayerGrain>(id);
    return await grain.GetSnapshot();
});
```

### 2. Front Door → Private Link → Internal Azure LB (L4) → Pods

The full traffic flow:

```
Internet
  │
  ▼
Azure Front Door Premium (L7)
  ├─ WAF rules (OWASP Top 10, rate limiting, bot detection)
  ├─ SSL termination (managed certificates)
  ├─ CDN caching (static assets)
  ├─ Global anycast routing (latency-based)
  └─ Health probes (HEAD /healthz every 30s)
  │
  ▼ (Private Link — traffic never leaves Azure backbone)
Internal Azure Load Balancer (L4)
  │
  ▼ (round-robin to healthy pods on port 8080)
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Pod A                        │  │ Pod B                        │
│  Kestrel ← HTTP :8080       │  │  Kestrel ← HTTP :8080       │
│  Orleans Silo ← :11111      │  │  Orleans Silo ← :11111      │
│  Orleans Gateway ← :30000   │  │  Orleans Gateway ← :30000   │
└──────────────────────────────┘  └──────────────────────────────┘
         ↕ silo-to-silo mesh (cluster-internal only) ↕
```

**No NGINX.** The Internal LB is L4 only — it distributes TCP connections to healthy pods. Once the HTTP request hits any pod's Kestrel endpoint, the co-hosted Orleans client knows the cluster topology and routes the grain call to the correct silo internally. It doesn't matter which pod initially receives the HTTP request.

### 3. Internal LB Targets Only the HTTP Port

The Kubernetes Service exposes only port 8080 (Kestrel) to the Internal LB:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orleans-app
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080      # Kestrel only
      protocol: TCP
  selector:
    app: orleans-app
```

Silo port 11111 and gateway port 30000 are exposed only via a headless ClusterIP service for intra-cluster silo-to-silo communication:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orleans-silo
spec:
  clusterIP: None            # Headless — no load balancing, DNS only
  ports:
    - name: silo
      port: 11111
    - name: gateway
      port: 30000
  selector:
    app: orleans-app
```

### 4. Orleans Handles Grain-Aware Routing

When an HTTP request arrives at Pod A but the target grain lives on Pod B:

1. Kestrel on Pod A handles the HTTP request
2. The endpoint calls `grainFactory.GetGrain<IPlayerGrain>(playerId)`
3. The co-hosted Orleans client checks the grain directory
4. If the grain is on Pod B, Orleans routes the call internally (silo-to-silo on port 11111)
5. The response flows back through Pod A to the client

This is transparent to the HTTP layer. The Internal LB doesn't need to know which pod hosts which grain — Orleans handles it.

### 5. Front Door Throughput Planning

Azure Front Door has a limit of **5,000 RPS per Point of Presence (POP)** per profile. For our 10K+ RPS target:

- **Multi-region deployment** naturally distributes traffic across POPs (users in Switzerland hit Zurich POP, users in Germany hit Frankfurt POP)
- **Single-region concentrated traffic** may exceed the per-POP limit — submit an Azure support request for a higher limit
- The Internal LB itself scales with node count and VM bandwidth — it won't be the bottleneck

### Comparison: NGINX Pattern vs. Direct-to-LB

| Concern | NGINX Pattern | Direct-to-LB (Our Choice) |
|---------|---------------|---------------------------|
| L7 routing (path, host) | NGINX + Front Door (redundant) | Front Door only |
| WAF | Front Door | Front Door |
| SSL termination | Front Door + NGINX (double) | Front Door + Kestrel |
| Extra network hop | Yes (LB → NGINX → Pod) | No (LB → Pod) |
| Extra pod resources | NGINX pods + HPA | None |
| Grain-aware routing | No (round-robin defeats Orleans) | Orleans handles internally |
| Operational complexity | NGINX config, cert sync, upgrades | Less moving parts |
| Latency overhead | +1-3ms per request (extra hop) | None |

## Alternatives Considered

- **NGINX Ingress Controller** — The standard AKS pattern. Adds L7 routing between Front Door and pods. For Orleans, this is redundant: Front Door already provides L7, and NGINX round-robin across pods actually works against Orleans' internal grain directory. Adds latency, pods, and operational complexity without benefit.

- **Azure Application Gateway** — Azure-managed L7 load balancer (alternative to NGINX). Same problem: an L7 layer between Front Door and Orleans is redundant. Application Gateway also has slower scaling characteristics than a simple Internal LB.

- **Exposing silo gateway ports publicly** — Orleans documentation explicitly recommends against this: "Exposing silo gateway ports as public endpoints of an Orleans cluster is not recommended. Instead, Orleans is intended to be fronted by your own API." The co-hosted ASP.NET API is that front.

- **YARP reverse proxy in-cluster** — YARP (Yet Another Reverse Proxy) is .NET-native and could replace NGINX. Viable if you need in-cluster L7 routing beyond what Front Door provides. Unnecessary for our architecture where Front Door handles all L7 concerns. Could be reconsidered if future requirements need header-based routing within the cluster.

## Consequences

- **Positive**: One fewer network hop per request — lower latency, fewer failure points.
- **Positive**: No NGINX pods to manage, upgrade, configure, or monitor. Simpler infrastructure.
- **Positive**: Orleans cluster topology used optimally — the co-hosted client routes directly to the right silo.
- **Positive**: Consistent .NET stack (Kestrel + Orleans) — no separate NGINX config language.
- **Negative**: Requires **Front Door Premium** tier for Private Link connectivity (cost increase over Standard). This is justified by the WAF and Private Link security posture.
- **Negative**: 5K RPS per POP limit requires awareness during capacity planning. Multi-region deployment mitigates this naturally.
- **Negative**: No in-cluster L7 routing — if future services need path-based routing within the cluster (not from external traffic), we'd need to add a solution. This can be revisited if the need arises.

## References

- [ADR-0001: Compute Platform — AKS](0001-compute-platform-DI.md)
- [ADR-0003: Application Framework — Orleans](0003-application-framework-DI.md)
- [ADR-0020: Global Load Balancing — Azure Front Door](0020-global-load-balancing-UI.md)
- [Orleans Hosting on Azure — Internal Docs](../orleans/05-global-hosting-on-azure.md)
- [Orleans Co-hosting with ASP.NET Core](https://learn.microsoft.com/dotnet/orleans/host/client#co-hosting)
- [Orleans Kubernetes Hosting](https://learn.microsoft.com/dotnet/orleans/deployment/kubernetes)
- [Orleans Load Balancing — Runtime Pillar](https://learn.microsoft.com/dotnet/orleans/overview#load-balancing)
- [Azure Front Door Private Link](https://learn.microsoft.com/azure/frontdoor/private-link)
- [AKS Internal Load Balancer](https://learn.microsoft.com/azure/aks/internal-lb)
