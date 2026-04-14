# AlwaysOn.Orleans — Aspire/AKS/Orleans Glue

**This library exists because of Aspire Orleans/Cosmos integration issues.**
When [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) is fixed,
this library should be deleted and apps should use native Aspire Orleans hosting.

## What it does
- Configures Orleans with K8s hosting, Cosmos clustering, Cosmos grain storage
- Creates dedicated CosmosClients (not Aspire DI) to avoid camelCase JSON conflicts
- Uses Gateway mode to avoid RNTBD SIGSEGV on .NET 10 (ADR-0062)
- Supports dual Cosmos endpoints: stamp-level for clustering, global for grain state
- All config is read from `IConfiguration.GetSection("Orleans")` automatically

## Usage
```csharp
// All config comes from IConfiguration ("Orleans" section)
builder.AddAlwaysOnOrleans(silo =>
{
    // App-specific: streaming, dashboard, etc.
    silo.AddDashboard();
});
```

### Environment variables
```
Orleans__GrainStorage__Endpoint=AccountEndpoint=https://...
Orleans__GrainStorage__Database=mydb
Orleans__GrainStorage__Container=myapp-grainstate
Orleans__GrainStorage__Name=GrainState          # optional, for named providers
Orleans__Clustering__Endpoint=AccountEndpoint=https://...  # optional, falls back to GrainStorage.Endpoint
Orleans__Clustering__Database=orleans
Orleans__Clustering__Container=myapp-cluster
Orleans__PubSub__Container=myapp-pubsub         # optional, for apps with streaming
```

## Related ADRs
- [ADR-0058: Orleans explicit provider config](../../docs/adr/0058-orleans-explicit-provider-config-DI.md)
- [ADR-0059: Orleans/Cosmos/Aspire known issues](../../docs/adr/0059-orleans-cosmos-aspire-known-issues-DI.md)
- [ADR-0062: Cosmos Gateway mode for SIGSEGV](../../docs/adr/0062-orleans-cosmos-gateway-mode-sigsegv-DI.md)
