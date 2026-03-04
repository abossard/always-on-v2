# Part 4 — Infrastructure & Operations

> Silo topology, clustering, persistence, placement strategies, serialization, best practices, and common pitfalls.

---

## Silo Topology & Clustering

### Clustering Providers

| Provider | Best For |
|---|---|
| `UseLocalhostClustering()` | Development only |
| `UseAdoNetClustering()` | SQL Server, PostgreSQL (production) |
| `UseAzureStorageClustering()` | Azure Table Storage (cloud-native) |
| `UseKubernetesHosting()` | Kubernetes native (replaces membership table) |
| Consul / Zookeeper | Via community packages |

### Deployment Platforms

| Platform | Notes |
|---|---|
| **Kubernetes** | Recommended. Use Deployments or StatefulSets. `UseKubernetesHosting()` for native membership. |
| **Azure Container Apps** | Serverless scaling. Membership via Azure Storage. Autoscaling on HTTP/custom metrics. |
| **Azure Service Fabric** | Orleans originally designed for this. Still supported. |
| **VMs / Bare Metal** | Works with systemd. Requires more operational discipline. |
| **.NET Aspire** | Modern orchestration. Automatic service discovery. Recommended for new projects. |

### Membership Mechanism

- Silos register in a shared membership table
- Failure detection via "ping-pong" mechanism between silos
- Failed silo's grains automatically reactivated on other silos
- Gossip protocol for multi-cluster awareness

---

## Persistence Strategies

### Built-in Storage Providers

| Provider | Package | Best For |
|---|---|---|
| In-Memory | `AddMemoryGrainStorage()` | Development / testing |
| ADO.NET | `Microsoft.Orleans.Persistence.AdoNet` | SQL Server, PostgreSQL |
| Azure Blob | `Microsoft.Orleans.Persistence.AzureStorage` | Cheap, scalable cloud |
| Azure Table | `Microsoft.Orleans.Persistence.AzureStorage` | Indexed access |
| Cosmos DB | `Microsoft.Orleans.Persistence.Cosmos` | Global distribution |
| DynamoDB | `Microsoft.Orleans.Persistence.DynamoDB` | AWS workloads |
| Redis | Community | Low-latency ephemeral state |

### Persistence Model

Grains use `IPersistentState<T>` — state lives in-memory and is persisted to storage on demand:

- `ReadStateAsync()` — load state from storage (called automatically on activation)
- `WriteStateAsync()` — persist current state to storage (called explicitly by grain)
- `ClearStateAsync()` — remove state from storage

### Storage Table Structure (ADO.NET)

| Table | Purpose |
|---|---|
| `OrleansQuery` | Queries executed by Orleans cluster |
| `OrleansMembershipTable` | Active/inactive silos with IP addresses |
| `OrleansMembershipVersionTable` | Cluster version tracking |
| `OrleansStorage` | Grain state (PayloadBinary, PayloadXml, or PayloadJson) |

### Serialization Options

| Serializer | Notes |
|---|---|
| **Orleans default** | Compile-time codegen, highest performance. **Recommended.** |
| Newtonsoft.Json | Flexible, human-readable. Slower. |
| System.Text.Json | Faster than Newtonsoft, less flexible. |
| Protobuf | Compact, schema-driven. Good for cross-platform. |

---

## Placement Strategies

| Strategy | Behavior | Best For |
|---|---|---|
| **Random** (default) | Random server selection | General purpose |
| **Local** | Prefer local silo, fallback to random | Co-located processing |
| **Hash-based** | Hash grain ID to select server | Deterministic placement |
| **Activation-count** | Place on least-busy silo | CPU-intensive grains |
| **Resource-optimized** | Balance by CPU + memory metrics | Mixed workloads |
| **Stateless worker** | Multiple activations per silo, not in grain directory | Horizontally scaled processing |
| **Silo-role based** | Deterministic placement by silo role | Workload isolation |

---

## Grain Design Best Practices

### Reentrancy

| Mode | Behavior | Use Case |
|---|---|---|
| **Default** (non-reentrant) | One request at a time, queues others | Most grains |
| `[Reentrant]` | Allows new requests while awaiting | Circular call patterns |
| `[AlwaysInterleave]` on method | Selective reentrancy per method | Read methods that shouldn't block |

### Grain Versioning

Orleans supports coexisting grain interface versions during rolling upgrades:
- `[Version(1)]` and `[Version(2)]` interfaces can coexist
- Allows adding new methods without breaking existing callers
- Silo routing respects version compatibility

### Request Context

Propagate metadata (correlation IDs, user claims) through grain call chains without polluting method signatures.

### Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| **God grains** | Grain does too much | Split by responsibility |
| **Circular grain calls** | Causes deadlocks | Use `[Reentrant]` or restructure |
| **Heavy state grains** | Large state slows activation/deactivation | Keep state small; overflow to external storage |
| **Grain as query engine** | Orleans has no built-in indexing | Use Elasticsearch/Azure AI Search |
| **Orleans for CRUD** | Simple read/write to DB | Orleans adds unnecessary complexity |
| **Orleans for heavy compute** | Batch processing, rendering | Not designed for this |

---

## Pitfalls & Lessons Learned

### From Halo Production

- **"Clients are jerks"** — 11M players simultaneously connecting on launch day created self-DoS
- **Azure Service Bus limtations** — scheduled messages feature wasn't fully available in all regions
- **Load test authentically** — use real recorded traffic, not synthetic data

### From Community

- **No grain indexing** — cannot query across grains; use external search
- **JournaledGrain documentation** — badly out of date; CustomStorage is the only production-ready option
- **Synchronous IDistributedCache** — don't use sync-over-async; Orleans is fundamentally async
- **XML/JSON serialization** — not all data round-trips safely; test thoroughly
- **Grain state size** — keep state small; large state slows activation/deactivation
- **Timer vs Reminder confusion** — timers are volatile (in-memory); reminders are durable (survive restarts)

### From Phil Bernstein (Microsoft Research)

> "The biggest impediment to scaling out an app across servers is to ensure no server is a bottleneck. Orleans does this by evenly distributing the objects across servers."

> "In Orleans, there is no built-in way of searching for data, or doing interactive analysis on data. This can only be efficiently implemented with an index."

---

## References

### Clustering & Topology

- [Orleans Clustering Providers — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/orleans/implementation/cluster-management)
- [Orleans Kubernetes Hosting](https://learn.microsoft.com/en-us/dotnet/orleans/deployment/kubernetes)
- [Orleans on Azure Container Apps — Azure Samples](https://github.com/Azure-Samples/Orleans-Cluster-on-Azure-Container-Apps)
- [.NET Aspire Documentation](https://learn.microsoft.com/en-us/dotnet/aspire/)
- [Orleans Membership Protocol — Research Paper](https://www.microsoft.com/en-us/research/publication/orleans-distributed-virtual-actors-for-programmability-and-scalability/)

### Persistence & Serialization

- [Orleans Grain Persistence — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence)
- [Microsoft.Orleans.Persistence.Cosmos — NuGet](https://www.nuget.org/packages/Microsoft.Orleans.Persistence.Cosmos)
- [Microsoft.Orleans.Persistence.AdoNet — NuGet](https://www.nuget.org/packages/Microsoft.Orleans.Persistence.AdoNet)
- [Orleans Serialization](https://learn.microsoft.com/en-us/dotnet/orleans/host/configuration-guide/serialization)
- [Orleans ADO.NET Storage Scripts](https://learn.microsoft.com/en-us/dotnet/orleans/host/configuration-guide/adonet-configuration)

### Placement & Grain Design

- [Orleans Grain Placement — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-placement)
- [Orleans Reentrancy](https://learn.microsoft.com/en-us/dotnet/orleans/grains/reentrancy)
- [Orleans Grain Versioning](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-versioning/grain-versioning)
- [Orleans Request Context](https://learn.microsoft.com/en-us/dotnet/orleans/grains/request-context)
- [Orleans Best Practices — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/orleans/resources/best-practices)

### Pitfalls & Lessons

- [Orleans GitHub Repository — Issues & Discussions](https://github.com/dotnet/orleans)
- [About Halo's Backend — CleverHeap](https://cleverheap.com/posts/about-halo-backend/)
- [Orleans Interview — Phil Bernstein (ODBMS.org)](https://www.odbms.org/blog/2016/02/orleans-the-technology-behind-xbox-halo4-and-halo5-interview-with-phil-bernstein/)
- [MV10/OrleansDistributedCache — Sync IDistributedCache caveats](https://github.com/MV10/OrleansDistributedCache)

### Sample Repositories

- [OrleansContrib/DesignPatterns](https://github.com/OrleansContrib/DesignPatterns)
- [IEvangelist/orleans-shopping-cart](https://github.com/IEvangelist/orleans-shopping-cart)
- [davidfowl/Orleans.PubSub](https://github.com/davidfowl/Orleans.PubSub)
- [pmorelli92/Orleans.Tournament](https://github.com/pmorelli92/Orleans.Tournament)
- [jsedlak/orleans-samples (Satellite Pattern)](https://github.com/jsedlak/orleans-samples/tree/main/patterns/patterns-satellite)
- [jsedlak/petl (Event Sourcing)](https://github.com/jsedlak/petl)
- [Maarten88/rrod (RROD)](https://github.com/Maarten88/rrod)
