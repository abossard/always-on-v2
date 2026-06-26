# Features & Applications

The catalog of applications, developer tools, and platform capabilities shipped in
this repo. Every row links to its **source** (code, Bicep, or ADR) so you can go from
"what" to "where" in one click.

For setup and deployment, see the [README](README.md). For CI/CD, GitOps, and
production topology, see [`ci-cd/`](ci-cd/README.md).

---

## Platform overview

| Layer | Technology | Source |
|---|---|---|
| **Compute** | Azure Kubernetes Service (AKS) — multi-stamp, Karpenter autoscale | [`infra/region.bicep`](infra/region.bicep), [ADR-0001](docs/adr/0001-compute-platform-DI.md) |
| **Multi-region** | Stamp architecture, active-active | [`infra/stamp.bicep`](infra/stamp.bicep), [ADR-0002](docs/adr/0002-multi-stamp-architecture-DI.md) |
| **Framework** | .NET 10, Orleans (virtual actors), Aspire (local dev) | [`src/AlwaysOn.Orleans`](src/AlwaysOn.Orleans/), [ADR-0003](docs/adr/0003-application-framework-DI.md) · [ADR-0004](docs/adr/0004-programming-language-DI.md) |
| **Database** | Azure Cosmos DB (NoSQL, multi-region writes, autoscale) | [`infra/stamp-cosmos.bicep`](infra/stamp-cosmos.bicep), [ADR-0006](docs/adr/0006-database-choice-DI.md) |
| **Ingress** | Azure Front Door (Standard/Premium, WAF, custom domains) | [`infra/app-routing.bicep`](infra/app-routing.bicep), [ADR-0041](docs/adr/0041-global-application-frontdoor-ingress-DI.md) |
| **GitOps** | Flux v2 (image automation, postBuild substitution) | [`clusters/`](clusters/), [`ci-cd/README.md`](ci-cd/README.md) |
| **Ingress (in-cluster)** | Istio Gateway API only | [`clusters/base/apps/gateway.yaml`](clusters/base/apps/gateway.yaml) |
| **DNS & TLS** | Azure DNS + cert-manager (Let's Encrypt) + external-dns | [`clusters/base/infra/`](clusters/base/infra/) |
| **AI** | Azure OpenAI (GPT-4.1, GPT-4.1-mini, GPT-5.4) | [`infra/ai.bicep`](infra/ai.bicep) |
| **Observability** | App Insights + OpenTelemetry + Prometheus | [`src/AlwaysOn.ServiceDefaults`](src/AlwaysOn.ServiceDefaults/), [ADR-0010](docs/adr/0010-observability-stack-DI.md) · [ADR-0053](docs/adr/0053-direct-azure-monitor-otel-exporters-DI.md) |
| **IaC** | Bicep (via Azure Developer CLI) | [`infra/main.bicep`](infra/main.bicep), [ADR-0011](docs/adr/0011-infrastructure-as-code-DI.md) |
| **CI/CD** | GitHub Actions (OIDC, multi-arch Docker) | [`.github/workflows/`](.github/workflows/), [`ci-cd/README.md`](ci-cd/README.md) |
| **Health** | `Microsoft.CloudHealth` health models (preview) | [`infra/healthmodel/`](infra/healthmodel/), [`src/az-healthmodel`](src/az-healthmodel/) |

---

## Example applications

Four applications are deployed by `azd` / GitHub Actions. They are defined as data in
[`infra/main.bicep`](infra/main.bicep) (the `apps` array, lines 81–118) — each entry
creates per-app infrastructure, Front Door routing, and a workload identity.

| App | Description | Stack | Namespace | Source |
|---|---|---|---|---|
| **DarkUxChallenge** | Accessibility testing challenge — hostile-but-truthful UX | .NET 10, Cosmos DB, Aspire, React+Vite, Native AOT | `darkux` | [`src/DarkUxChallenge/`](src/DarkUxChallenge/README.md) |
| **HelloAgents** | AI multi-agent conversations with Orleans streaming | .NET 10, Orleans, Azure OpenAI, Cosmos DB, React | `helloagents` | [`src/HelloAgents/`](src/HelloAgents/README.md) |
| **GraphOrleons** | Event-driven graph modeling with Orleans grains | .NET 10, Orleans, Cosmos DB, Event Hubs, React+Vite | `graphorleons` | [`src/GraphOrleons/`](src/GraphOrleons/) |
| **HelloOrleons** | Orleans clustering demo | .NET 10, Orleans | `helloorleons` | [`src/HelloOrleons/`](src/HelloOrleons/) |

Each app uses [TUnit](https://tunit.dev/) for tests; the three with a SPA also ship
[Playwright](https://playwright.dev/) E2E suites (`*.E2E`). See each app folder for the
`.slnx` solution and `AppHost` entry point.

> Shared libraries used by all Orleans apps:
> [`src/AlwaysOn.Orleans`](src/AlwaysOn.Orleans/) (Cosmos clustering, K8s hosting) and
> [`src/AlwaysOn.ServiceDefaults`](src/AlwaysOn.ServiceDefaults/) (OpenTelemetry, health checks).

---

## Developer tools

| Tool | Description | Source |
|---|---|---|
| **`az healthmodel`** | Azure CLI extension for Health Models: CRUD + live TUI watch mode + SVG export | [`src/az-healthmodel/`](src/az-healthmodel/README.md) |
| **Health model generator** | Generates `healthmodel.bicep` from TypeScript signal/group definitions (single source of truth for thresholds + Grafana) | [`scripts/healthmodel/`](scripts/healthmodel/) |
| **Grafana dashboard generator** | Builds Azure Monitor JSON dashboards | [`scripts/grafana/`](scripts/grafana/), output in [`docs/grafana/`](docs/grafana/) |
| **Health Model Agent Skills** | Discovery → architecture → design → deploy workflow for agents (Claude Code / Copilot) | External repo: [abossard/azure-healthmodel-skills](https://github.com/abossard/azure-healthmodel-skills) |

---

## Infrastructure features

| Feature | Source |
|---|---|
| Multi-region AKS stamps (extensible, data-driven) | [`infra/main.parameters.json`](infra/main.parameters.json) · [`infra/region.bicep`](infra/region.bicep) |
| Cosmos DB (Serverless or multi-write Provisioned, autoscale, continuous backup) | [`infra/stamp-cosmos.bicep`](infra/stamp-cosmos.bicep) |
| Azure Front Door (Standard/Premium, health probes, custom domains) | [`infra/app-routing.bicep`](infra/app-routing.bicep) |
| Flux GitOps (per-cluster config, image automation, postBuild substitution) | [`infra/stamp.bicep`](infra/stamp.bicep) · [`clusters/`](clusters/) |
| Istio Gateway API (HTTPRoute per app, cert-manager integration) | [`clusters/base/apps/gateway.yaml`](clusters/base/apps/gateway.yaml) |
| Private endpoints (per-stamp VNet, public access disabled) | [`infra/stamp.bicep`](infra/stamp.bicep) |
| OpenTelemetry → App Insights (direct exporter APIs) | [ADR-0053](docs/adr/0053-direct-azure-monitor-otel-exporters-DI.md) |
| Prometheus metrics (AMA scraping, Istio Envoy sidecars) | [`clusters/base/infra/ama-metrics-settings-configmap.yaml`](clusters/base/infra/ama-metrics-settings-configmap.yaml) |
| Health model (`Microsoft.CloudHealth`, preview) | [`infra/healthmodel/`](infra/healthmodel/) · [`scripts/healthmodel/`](scripts/healthmodel/) |
| Workload Identity (per-app managed identity, federated credentials, RBAC) | [`infra/app-infra.bicep`](infra/app-infra.bicep) · [`infra/app-federated-creds.bicep`](infra/app-federated-creds.bicep) |
| cert-manager + external-dns (Let's Encrypt TLS, auto Azure DNS records) | [`clusters/base/infra/cert-manager.yaml`](clusters/base/infra/cert-manager.yaml) · [`clusters/base/infra/external-dns.yaml`](clusters/base/infra/external-dns.yaml) |
| Native AOT (chiseled containers) | DarkUxChallenge — [`src/DarkUxChallenge/`](src/DarkUxChallenge/README.md) |
| Karpenter autoscaling (spot-preferred app workloads) | [`clusters/base/infra/karpenter-spot.yaml`](clusters/base/infra/karpenter-spot.yaml) |

---

## Deployment status

| App | Deployed | Namespace | Gateway route | CI/CD workflow |
|---|:---:|---|---|---|
| DarkUxChallenge | ✅ | `darkux` | [darkux.alwayson.actor](https://darkux.alwayson.actor) | [`darkux-cicd.yml`](.github/workflows/darkux-cicd.yml) |
| HelloAgents | ✅ | `helloagents` | [agents.alwayson.actor](https://agents.alwayson.actor) | [`helloagents-cicd.yml`](.github/workflows/helloagents-cicd.yml) |
| GraphOrleons | ✅ | `graphorleons` | [events.alwayson.actor](https://events.alwayson.actor) | [`graphorleons-cicd.yml`](.github/workflows/graphorleons-cicd.yml) |
| HelloOrleons | ✅ | `helloorleons` | [hello.alwayson.actor](https://hello.alwayson.actor) | [`helloorleons-cicd.yml`](.github/workflows/helloorleons-cicd.yml) |

> Custom-domain routes apply when `enableCustomDomain = true`. The default `azd`
> deployment uses Front Door default endpoints (printed at the end of `azd up`).

---

## Observability

All apps use the `Azure.Monitor.OpenTelemetry.AspNetCore` distro with `UseAzureMonitor()`
and `DefaultAzureCredential` for managed-identity auth. The shared
[`AlwaysOn.ServiceDefaults`](src/AlwaysOn.ServiceDefaults/) project configures the full
OpenTelemetry pipeline (traces, metrics, logs) with automatic instrumentation for
ASP.NET Core, HTTP clients, and runtime metrics. See
[ADR-0053](docs/adr/0053-direct-azure-monitor-otel-exporters-DI.md).

---

## Architecture decisions

All architecture decisions are documented as ADRs in
[`docs/adr/`](docs/adr/README.md) — the index there links every record by number and
status.
