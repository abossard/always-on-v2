# ADR-0058: Explicit Orleans Provider Configuration over Aspire Auto-Config

## Status

Accepted

## Context

HelloOrleons uses Orleans 10.0.1 with Cosmos DB for grain storage and clustering.
The initial implementation used the Aspire Orleans integration (`AddOrleans().WithClustering(cosmos).WithGrainStorage("Default", cosmos)`) which injects environment variables like `Orleans__GrainStorage__Default__ProviderType=AzureCosmosDB` for Orleans to auto-discover providers.

This **does not work** with Orleans 10.0.1. At startup, Orleans crashes with:

```
System.InvalidOperationException: Could not find GrainStorage provider named 'AzureCosmosDB'.
This can indicate that either the 'Microsoft.Orleans.Sdk' or the provider's package are
not referenced by your application.
```

### Root Cause Chain

1. **Aspire** calls `ProviderConfiguration.Create(resourceBuilder)` which derives the provider type from the resource class name: `AzureCosmosDBResource` → strips `Resource` → `"AzureCosmosDB"`.

2. **Aspire** injects env vars: `Orleans__GrainStorage__Default__ProviderType=AzureCosmosDB` and `Orleans__GrainStorage__Default__ServiceKey=cosmos`.

3. **Orleans** `DefaultSiloServices.ApplyConfiguration()` reads these env vars via `IConfiguration` and looks up `"AzureCosmosDB"` in a dictionary of known provider types.

4. **Orleans** builds this dictionary by scanning all loaded assemblies for `[RegisterProvider]` attributes: `AppDomain.CurrentDomain.GetAssemblies().SelectMany(asm => asm.GetCustomAttributes<RegisterProviderAttribute>())`.

5. **The `Orleans.Persistence.Cosmos` and `Orleans.Clustering.Cosmos` assemblies do not have `[RegisterProvider]` attributes** in version 10.0.1. The provider type `"AzureCosmosDB"` is never registered → lookup fails → crash.

```mermaid
flowchart TD
    classDef aspire   fill:#0078d4,color:#fff,stroke:#005a9e,stroke-width:2px
    classDef envvar   fill:#d46b08,color:#fff,stroke:#ad5a07,stroke-width:2px
    classDef runtime  fill:#5c2d91,color:#fff,stroke:#4a2474,stroke-width:2px
    classDef broken   fill:#991b1b,color:#fff,stroke:#7f1d1d,stroke-width:2px
    classDef crash    fill:#0f0f0f,color:#ff453a,stroke:#ff0000,stroke-width:3px

    A(["🔷 Aspire AppHost\nAddOrleans().WithClustering(cosmos)\n.WithGrainStorage(cosmos)"]):::aspire
    B["ProviderConfiguration.Create()\nAzureCosmosDBResource → strip 'Resource'\n→ type name = AzureCosmosDB"]:::aspire
    C["🌍 Injected Env Vars\nOrleans__Clustering__ProviderType = AzureCosmosDB\nOrleans__GrainStorage__Default__ProviderType = AzureCosmosDB\nOrleans__*__ServiceKey = cosmos"]:::envvar
    D["⚙️ SiloBuilder constructor\nDefaultSiloServices.ApplyConfiguration()\nreads IConfiguration Orleans__ sections"]:::runtime
    E["🔍 Assembly Scanner\nAppDomain.CurrentDomain.GetAssemblies()\n.SelectMany(GetCustomAttributes RegisterProviderAttribute)"]:::runtime
    F[("📦 Orleans.Persistence.Cosmos 10.0.1\nOrleans.Clustering.Cosmos 10.0.1")]:::broken
    G["❌ No RegisterProvider attributes found\nAzureCosmosDB not in provider type dictionary"]:::broken
    H[["💥 InvalidOperationException\nCould not find Clustering provider\nnamed 'AzureCosmosDB'"]]:::crash

    A --> B --> C --> D --> E --> F --> G --> H
```

### Why Assembly.Load doesn't help

We tried `Assembly.Load("Orleans.Persistence.Cosmos")` before `UseOrleans()` — the assemblies load but they simply **don't contain** `[RegisterProvider("AzureCosmosDB", ...)]` attributes. This is a known gap tracked in [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) (source generator should scan for these at build time, still in draft as of April 2026).

## Decision

Use **explicit provider registration** via `silo.AddCosmosGrainStorageAsDefault()` and `silo.UseCosmosClustering()` instead of Aspire's `AddOrleans().WithGrainStorage()` auto-configuration.

This means:
- **Remove** `Aspire.Hosting.Orleans` from the AppHost
- **Remove** `AddOrleans()` / `WithClustering()` / `WithGrainStorage()` from AppHost
- **Keep** `AddAzureCosmosDB()` in AppHost for the emulator and connection string injection
- **Add** explicit `silo.AddCosmosGrainStorageAsDefault()` and `silo.UseCosmosClustering()` in the API's `UseOrleans` block
- **Fallback** to `UseLocalhostClustering()` + `AddMemoryGrainStorageAsDefault()` when no Cosmos connection string is present

This is consistent with the HelloAgents project which already uses this pattern successfully.

```mermaid
flowchart LR
    classDef apphost fill:#0078d4,color:#fff,stroke:#005a9e,stroke-width:2px
    classDef api     fill:#5c2d91,color:#fff,stroke:#4a2474,stroke-width:2px
    classDef prod    fill:#107c10,color:#fff,stroke:#0e6610,stroke-width:2px
    classDef dev     fill:#374151,color:#d1d5db,stroke:#6b7280,stroke-width:2px
    classDef k8s     fill:#0369a1,color:#fff,stroke:#0c4a6e,stroke-width:2px

    subgraph AppHost ["🔷 Aspire AppHost (fixed)"]
        AH(["AddAzureCosmosDB()\nemulator + connection string\n\nNO AddOrleans()\nNO WithGrainStorage()\nNO WithClustering()"]):::apphost
    end

    subgraph API ["🟣 Orleans API — Program.cs"]
        direction TB
        CHECK{"cosmos conn str\npresent?"}:::api
        PROD["🌐 Production Mode\nsilo.UseCosmosClustering()\nsilo.AddCosmosGrainStorageAsDefault()\nsilo.UseKubernetesHosting()"]:::prod
        DEV["🛠️ Dev / Fallback\nsilo.UseLocalhostClustering()\nsilo.AddMemoryGrainStorageAsDefault()"]:::dev
        CHECK -->|"✅ yes"| PROD
        CHECK -->|"no"| DEV
    end

    subgraph K8s ["☸️ Kubernetes Deployment"]
        ENV["env vars\nORLEANS_CLUSTERING: Kubernetes\nConnectionStrings__cosmos: AccountEndpoint...\n\nNO Orleans__* auto-config vars"]:::k8s
    end

    AH -->|"injects ConnectionStrings__cosmos"| CHECK
    ENV -->|"injects env vars at runtime"| CHECK
```

## Alternatives Considered

- **Aspire auto-config** (`AddOrleans().WithGrainStorage()`) – Broken with Orleans 10.0.1 due to missing `[RegisterProvider]` attributes. May work in future Orleans versions once [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) is resolved.
- **Assembly.Load workaround** – Load `Orleans.Persistence.Cosmos` / `Orleans.Clustering.Cosmos` manually before `UseOrleans()`. Doesn't help because the assemblies lack the attribute.
- **Keyed CosmosClient registration** – Register `AddKeyedSingleton<CosmosClient>("cosmos")` for Orleans to resolve via `ServiceKey`. Fails for the same reason: no `[RegisterProvider]` to map provider type to builder.

## Consequences

- **Positive**: Orleans starts correctly with Cosmos DB emulator and production endpoints.
- **Positive**: Consistent with HelloAgents pattern — single proven approach across projects.
- **Positive**: No dependency on Aspire Orleans integration package in AppHost.
- **Negative**: Database/container names are hardcoded in the API project rather than centralized in the AppHost. Acceptable since they must match the Cosmos containers created by Aspire anyway.
- **Negative**: When Orleans adds source-generated `[RegisterProvider]` support, we'll need to revisit to potentially simplify back to Aspire auto-config.

## References

- [dotnet/orleans#9730](https://github.com/dotnet/orleans/issues/9730) — Source Generator should scan for RegisterProvider attributes at build time (open, draft PR)
- [dotnet/orleans#9731](https://github.com/dotnet/orleans/pull/9731) — Draft PR: Generate RegisterProvider metadata at build time via source generator
- [Aspire ProviderConfiguration.cs](https://github.com/dotnet/aspire/blob/main/src/Aspire.Hosting.Orleans/ProviderConfiguration.cs) — How Aspire derives provider type name from resource class
- [Aspire OrleansServiceExtensions.cs](https://github.com/dotnet/aspire/blob/main/src/Aspire.Hosting.Orleans/OrleansServiceExtensions.cs) — WithGrainStorage / WithClustering implementation
- [Orleans DefaultSiloServices.cs](https://github.com/dotnet/orleans/blob/main/src/Orleans.Runtime/Hosting/DefaultSiloServices.cs) — Assembly scanning that fails to find providers
- [Orleans Cosmos DB grain persistence docs](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/azure-cosmos-db) — Official explicit configuration API
- ADR-0056: HelloOrleons write-behind high performance (original design)

## App Status

```mermaid
flowchart TD
    classDef issue  fill:#b45309,color:#fff,stroke:#92400e,stroke-width:2px
    classDef fixed  fill:#107c10,color:#fff,stroke:#0e6610,stroke-width:2px
    classDef detail fill:#166534,color:#fff,stroke:#14532d,stroke-width:1px
    classDef future fill:#1e293b,color:#94a3b8,stroke:#475569,stroke-width:2px,stroke-dasharray:5 5

    ISSUE(["🐛 Root Cause\ndotnet/orleans#9730\nRegisterProvider attributes missing\nfrom Orleans 10.0.1 Cosmos packages"]):::issue

    HO["HelloOrleons\n✅ FIXED"]:::fixed
    GO["GraphOrleons\n✅ FIXED"]:::fixed
    HA["HelloAgents\n✅ ALREADY CLEAN"]:::fixed

    HO_PC["Program.cs\nexplicit provider config\nUseCosmosClustering()\nAddCosmosGrainStorageAsDefault()"]:::detail
    HO_K8S["K8s deployment.yaml\nOrleans__* env vars removed\n(8 vars deleted)"]:::detail

    GO_PC["Program.cs\nexplicit provider config\nUseCosmosClustering()"]:::detail
    GO_K8S["K8s deployment.yaml\nOrleans__* env vars removed\n(4 vars deleted)"]:::detail

    HA_PC["Program.cs\nexplicit provider config\nalready correct — no changes needed"]:::detail

    FUTURE(["🔮 Future\nwhen dotnet/orleans#9730 ships"]):::future
    REVERT["May revert to Aspire auto-config\nAddOrleans().WithGrainStorage()\nonce RegisterProvider source-gen lands"]:::future

    ISSUE --> HO & GO & HA
    HO --> HO_PC & HO_K8S
    GO --> GO_PC & GO_K8S
    HA --> HA_PC

    ISSUE -.->|"when resolved"| FUTURE
    FUTURE -.-> REVERT
```
