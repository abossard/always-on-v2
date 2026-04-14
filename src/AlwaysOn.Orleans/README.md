# AlwaysOn.Orleans — Aspire/AKS/Orleans Glue

**This library exists because of Aspire Orleans/Cosmos integration issues.**
When [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) is fixed,
this library should be deleted and apps should use native Aspire Orleans hosting.

## What it does
- Configures Orleans with K8s hosting, Cosmos clustering, Cosmos grain storage
- Creates dedicated CosmosClients (not Aspire DI) to avoid camelCase JSON conflicts
- Uses Gateway mode to avoid RNTBD SIGSEGV on .NET 10 (ADR-0062)
- Supports dual Cosmos endpoints: stamp-level for clustering, global for grain state

## Usage
```csharp
builder.AddAlwaysOnOrleans(
    options =>
    {
        options.ClusteringEndpoint = cosmosConnectionString;
        options.GrainStorageEndpoint = cosmosConnectionString;
        options.ClusteringDatabase = "mydb";
        options.GrainStorageDatabase = "mydb";
        options.ClusterContainer = "myapp-cluster";
        options.GrainStorageContainer = "myapp-grainstate";
        options.PubSubContainer = "myapp-pubsub"; // optional
    },
    silo =>
    {
        // App-specific: streaming, dashboard, etc.
        silo.AddDashboard();
    });
```

## Related ADRs
- [ADR-0058: Orleans explicit provider config](../../docs/adr/0058-orleans-explicit-provider-config-DI.md)
- [ADR-0059: Orleans/Cosmos/Aspire known issues](../../docs/adr/0059-orleans-cosmos-aspire-known-issues-DI.md)
- [ADR-0062: Cosmos Gateway mode for SIGSEGV](../../docs/adr/0062-orleans-cosmos-gateway-mode-sigsegv-DI.md)
