# Copilot Instructions — AlwaysOn v2

## Communication Rules

- Never lie. Evidence or nothing.
- Never guess.
- If you interpret: show the data and mark your interpretation as such.
- AI statements are NEVER results.

## Architecture

Multi-region active-active platform on Azure. Each "stamp" is an AKS cluster in a different region, fronted by Azure Front Door. Apps use Orleans (virtual actors) with Cosmos DB for clustering and grain state. Aspire orchestrates local development.

**Layered infrastructure (Bicep):**
- `infra/main.bicep` → subscription-scoped entry point (parameters, stamp loop)
- `infra/global.bicep` → shared resources (ACR, Front Door, Cosmos global, DNS, AI)
- `infra/region.bicep` → per-region resources (AKS, managed identities)
- `infra/stamp.bicep` → per-stamp resources (Cosmos stamp, storage, wiring)
- `infra/healthmodel/healthmodel.bicep` → **auto-generated, do not edit** (see codegen below)

**GitOps:** Flux v2 reconciles `clusters/` manifests. K8s manifests use Kustomize with `postBuild` envsubst. Per-region overlays in `clusters/{region}/`.

**Shared .NET libraries:**
- `src/AlwaysOn.Orleans` — Cosmos clustering, K8s hosting, activity propagation (used by all Orleans apps)
- `src/AlwaysOn.ServiceDefaults` — OpenTelemetry, health checks, service discovery

## Build, Test, Lint

### .NET apps (DarkUxChallenge, HelloAgents, GraphOrleons, HelloOrleons)

```bash
# Run locally (example: HelloAgents)
cd src/HelloAgents
aspire run --apphost HelloAgents.AppHost

# Build
dotnet build src/HelloAgents/HelloAgents.slnx

# Run all tests (requires Docker for Cosmos emulator)
dotnet test src/HelloAgents/HelloAgents.slnx

# Run a single test
dotnet test src/HelloAgents/HelloAgents.Tests --filter "WorkflowTests"

# Lint (warnings-as-errors via Directory.Build.props)
dotnet build src/HelloAgents/HelloAgents.slnx --no-restore
```

Each app has its own `.slnx` under `src/{App}/`. The top-level `src/src.slnx` covers older non-Aspire projects only.

### Bicep (infrastructure)

```bash
az bicep build --file infra/main.bicep --stdout >/dev/null
```

### Health model TypeScript (codegen)

```bash
cd scripts/healthmodel && npx tsc --noEmit -p tsconfig.json
```

### E2E tests (Playwright)

```bash
cd src/DarkUxChallenge/DarkUxChallenge.E2E
npm ci && npx playwright test
# Single test file:
npx playwright test tests/some-test.spec.ts
```

### az-healthmodel CLI extension (Python)

```bash
cd src/az-healthmodel
python3 -m pytest azext_healthmodel/tests/test_e2e.py -v
```

## Conventions

### Health model codegen pipeline

`infra/healthmodel/healthmodel.bicep` is **auto-generated** by `npx ts-node scripts/healthmodel/generate.ts` from TypeScript sources (`signals.ts`, `groups.ts`, `builder.ts`, `types.ts`). Never edit the `.bicep` directly — change the TypeScript and regenerate. The same signal definitions feed both health model Bicep and Grafana dashboards (single source of truth for thresholds).

### TUnit test pattern (TestMatrix + abstract suites)

Tests use a two-layer pattern:
1. **Abstract test suites** (`Level1ConfirmshamingTests`, `WorkflowTests`) contain test logic, parameterized by an API client
2. **`TestMatrix.cs`** wires suites to backends using `[InheritsTests]` + `[ClassDataSource<AspireFixture>]`

To add tests: write an abstract suite, then add one line to `TestMatrix.cs`. Tests use `Aspire.Hosting.Testing` — the fixture boots the full Aspire app host including Cosmos emulator.

### Orleans configuration

- Use `AlwaysOn__` prefix for custom config — never `Orleans__` (conflicts with Orleans auto-configuration)
- `ServiceId` identifies the app (same across stamps); `ClusterId` scopes to a specific stamp — don't conflate them
- `[GenerateSerializer]` records must use concrete types (`string[]`, `List<T>`) — not interfaces like `IReadOnlyList<T>`
- Grain state classes need `set` not `init` for deserialization

### Cosmos DB

- Force Gateway mode for all Cosmos clients (.NET 10 RNTBD SIGSEGV workaround)
- RBAC scoped to database level (`dbs/X`), not ARM paths
- Never add manual retry loops — the SDK has built-in retry

### Flux / Kubernetes

- Don't `kubectl rollout restart` — Flux reverts it. Delete pods directly instead.
- `IsResourceCreationEnabled` must be `true` in Aspire (local) but `false` in K8s (Bicep creates containers)

### Code style

- `TreatWarningsAsErrors` is enabled globally via `src/Directory.Build.props`
- All .NET analyzers at Recommended level with `EnforceCodeStyleInBuild`
- Indent: 4 spaces (C#), 2 spaces (JSON/YAML/Bicep) — see `.editorconfig`

### Git operations

Never run `git add`, `git commit`, or `git push` — the user manages all git operations.

### Deployment verification

Bicep compilation alone is not sufficient. Work is only done when deployed to Azure and verified with live signals.
