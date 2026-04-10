# ADR-0058: Explicit Orleans Provider Configuration over Aspire Auto-Config

**Status:** Decided

## Context
- Aspire `AddOrleans().WithClustering(cosmos).WithGrainStorage()` injects env vars like `Orleans__*__ProviderType=AzureCosmosDB`
- Orleans 10.0.1 scans assemblies for `[RegisterProvider]` attributes — Cosmos provider assemblies **don't have them** → startup crash
- `Assembly.Load` doesn't help — the assemblies lack the attributes entirely

## Decision
- Use **explicit provider registration**: `silo.AddCosmosGrainStorageAsDefault()` + `silo.UseCosmosClustering()`
- Remove `Aspire.Hosting.Orleans` from AppHost; keep `AddAzureCosmosDB()` for emulator + connection string
- Fallback to `UseLocalhostClustering()` + `AddMemoryGrainStorageAsDefault()` when no Cosmos connection string

## Consequences
- Orleans starts correctly with Cosmos in all environments
- Consistent pattern across all Orleans projects (HelloOrleons, GraphOrleons, HelloAgents)
- May revert to Aspire auto-config when [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) ships

## Links
- [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) — RegisterProvider source generator (open)
- [Orleans Cosmos DB persistence docs](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/azure-cosmos-db)
