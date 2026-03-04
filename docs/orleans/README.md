# Orleans Architecture Documentation

> Split into focused modules for easier navigation and maintenance.

## Parts

| Part | Topic | Description |
|---|---|---|
| [01 — Principles & Foundations](01-principles-and-foundations.md) | Core architecture | Why Orleans, design principles, comparison with alternatives |
| [02 — Case Studies](02-case-studies.md) | Production deployments | Halo/Xbox, known users, financial services, benchmarks |
| [03 — Design Patterns](03-design-patterns.md) | Reusable patterns | Smart Cache, CQRS, Saga, IoT Digital Twin, Satellite, Game Lobbies, Redux |
| [04 — Infrastructure & Operations](04-infrastructure-and-operations.md) | Running Orleans | Silo topology, clustering, persistence, placement, serialization, best practices, pitfalls |
| [05 — Global Hosting on Azure](05-global-hosting-on-azure.md) | Multi-region deployment | Front Door, AKS multi-region, Cosmos DB, scaling, disaster recovery |

## Related Platform Designs

- [Blockchain Analytics Platform](../blockchain-analytics-platform.md)
- [Real-Time Chat & Walkie-Talkie Platform](../realtime-chat-walkietalkie-platform.md)

## References

- [Orleans Documentation — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/orleans/)
- [Orleans GitHub Repository](https://github.com/dotnet/orleans)
- [OrleansContrib/DesignPatterns](https://github.com/OrleansContrib/DesignPatterns)
- [Distributed .NET with Microsoft Orleans (O'Reilly Book)](https://www.oreilly.com/library/view/distributed-net-with/9781801818971/)
