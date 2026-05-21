# AlwaysOn v2 — Mission-Critical Applications on Azure

A hands-on learning framework for senior software engineers: design, build, and operate **globally distributed, mission-critical** applications on Microsoft Azure.

## Platform Overview

| Layer              | Technology                                                        |
|--------------------|-------------------------------------------------------------------|
| **Compute**        | Azure Kubernetes Service (AKS) — multi-stamp, Karpenter autoscale |
| **Istio**   | Just for the Gateway API                     |
| **GitOps**         | Flux v2 (image automation, postBuild substitution)                |
| **Framework**      | .NET 10, Orleans (virtual actors), Aspire (local dev)             |
| **Database**       | Azure Cosmos DB (NoSQL, multi-region writes, autoscale)           |
| **Caching**        | None at the moment, Frontdoor                                                |
| **AI**             | Azure OpenAI (GPT-4.1, GPT-4.1-mini, GPT-5.4)                   |
| **Observability**  | Application Insights + OpenTelemetry + Prometheus                 |
| **Ingress**        | Azure Front Door (Premium/Standard, WAF, custom domains)          |
| **DNS & TLS**      | Azure DNS + cert-manager (Let's Encrypt) + external-dns           |
| **IaC**            | Bicep (via Azure Developer CLI)                                   |
| **CI/CD**          | GitHub Actions (OIDC auth, multi-arch Docker builds)              |
| **Health**         | Microsoft.CloudHealth health models (preview), [`az healthmodel`](src/az-healthmodel/) CLI extension |

## Example Applications

| App | Description | Tech Stack | SPA | Tests | E2E | AOT |
|-----|-------------|------------|:---:|:-----:|:---:|:---:|
| **[DarkUxChallenge](src/DarkUxChallenge/)** | Accessibility testing challenge — hostile-but-truthful UX | .NET 10, Cosmos DB, Aspire | ✅ React+Vite | ✅ TUnit | ✅ Playwright | ✅ |
| **[HelloAgents](src/HelloAgents/)** | AI multi-agent conversations with Orleans streaming | .NET 10, Orleans, OpenAI, Cosmos DB | ✅ React | ✅ TUnit | ✅ Playwright | — |
| **[GraphOrleons](src/GraphOrleons/)** | Event-driven graph modeling with Orleans grains | .NET 10, Orleans, Cosmos DB, Aspire | ✅ React+Vite | ✅ TUnit | ✅ Playwright | — |
| **[HelloOrleons](src/HelloOrleons/)** | Orleans clustering demo | .NET 10, Orleans | — | ✅ TUnit | — | — |
| **[PlayersOn](src/PlayersOn/)** | Orleans grain architecture reference | .NET 10, Orleans | — | ✅ | — | — |
| **[PlayersOnOrleans](src/PlayersOnOrleons/)** | Minimal Orleans alternative demo | .NET 10, Orleans | — | ✅ | — | — |
| **[Orthereum](src/Orthereum/)** | Ethereum-like state machine with AOT | .NET 10, Orleans, AOT | — | ✅ | — | ✅ |

### Developer Tools

| Tool | Description | Details |
|------|-------------|---------|
| **[`az healthmodel`](src/az-healthmodel/)** | Azure CLI extension for Health Models | CRUD + live TUI watch mode + SVG export. [See README](src/az-healthmodel/README.md) |
| **[`scripts/healthmodel/`](scripts/healthmodel/)** | Health model Bicep generator | Generates `healthmodel.bicep` from shared `config.json` |
| **[`scripts/grafana/`](scripts/grafana/)** | Grafana dashboard generator | Builds JSON dashboards for Azure Monitor |
| **[Agent Skills](skills/)** | Agent-driven Health Model workflow | Orchestrator + 5 phase skills (discovery → architecture → design → deploy → catalog). Uses only `az rest` + `az bicep` + `jq` — no extensions. [Install below.](#installing-the-agent-skills) |

### Health Model Agent Skills

The Health Model agent skills have moved to their own repository:

👉 **[abossard/azure-healthmodel-skills](https://github.com/abossard/azure-healthmodel-skills)**

Six skills covering the end-to-end Health Model workflow (discovery → architecture → design → deploy), following the [open Agent Skills standard](https://agentskills.io). See that repo's README for install instructions.

#### Quick install

```bash
# Plugin install (Claude Code / Copilot CLI)
claude plugin marketplace add abossard/azure-healthmodel-skills
claude plugin install healthmodel@healthmodel

# or with copilot:
copilot plugin marketplace add abossard/azure-healthmodel-skills
copilot plugin install healthmodel@healthmodel
```

**Runtime requirements** (host machine running the agent):
- `az` CLI ≥ 2.60 with `az bicep` available (offline schema validation)
- `jq` (already listed under [Prerequisites](#prerequisites))
- Authenticated `az account show` against the target subscription
- `Microsoft.CloudHealth` provider registered (the deploy skill's `bootstrap.sh` will register it on demand)

**Quick start:** in any Claude session after install, ask *"build an Azure Monitor health model for this app"* — the `healthmodel-orchestrator` skill picks up the workflow and chains the phases with human checkpoints between each.

### Using the Skills with VS Code + GitHub Copilot

GitHub Copilot natively supports Agent Skills (`SKILL.md`) in VS Code agent mode since the December 2025 rollout, expanded in April 2026. Agent Skills is an [open standard](https://agentskills.io) — the same files work in Copilot, Claude Code, the Copilot CLI, and other agents. **No bridge files, no `copilot-instructions.md`, no prompt-file wrappers.**

**Setup:** none. Agent Skills are enabled by default in modern Copilot. VS Code auto-discovers from these locations:

| Scope | Discovered paths |
|---|---|
| Per-repo | `skills/` (plugin convention, this repo's choice), `.agents/skills/` (symlinked), `.github/skills/`, `.claude/skills/` |
| Personal (any project) | `~/.agents/skills/`, `~/.copilot/skills/`, `~/.claude/skills/` |

This repo ships the skills under `skills/` (with a symlink at `.agents/skills/`), so opening the workspace in VS Code with Copilot is all you need.

**Invoke from Copilot Chat:**
- **Auto-load** (most common): describe the task — Copilot matches against each skill's `description:` and loads the relevant one(s). Example: *"build an Azure Monitor health model for this app"* → `healthmodel-orchestrator` auto-loads.
- **`/skills`** — open the Configure Skills picker (browse, enable/disable, install).
- **`/<skill-name>`** — explicit invocation: `/healthmodel-orchestrator`, `/healthmodel-deploy`, etc.

**Progressive disclosure**: even with all six skills registered, only the 1–3 relevant to the current request are expanded into context. The `healthmodel-signal-catalog` skill uses `disable-model-invocation: true` so it never auto-loads — it's reference data that the other skills pull in by relative path.

**Monorepo tip:** if you open a subfolder rather than the repo root, enable `chat.useCustomizationsInParentRepositories` so VS Code walks up to find `skills/`.

**Other Copilot surfaces:** the same `skills/` directory is also picked up by the GitHub Copilot CLI and the Copilot cloud agent without changes. JetBrains IDEs support is in public preview — enable via *Settings → GitHub Copilot → Chat → Agent*.

**Verify it's working:** open Copilot Chat, type `/` — you should see `healthmodel-orchestrator`, `healthmodel-discovery`, `healthmodel-architecture`, `healthmodel-design`, `healthmodel-deploy` in the list (the signal catalog is hidden by design).

### Deployment Status

| App | Deployed | Namespace | CI/CD | Infra (Bicep) | Gateway Route | Regions |
|-----|:--------:|-----------|:-----:|:-------------:|---------------|---------|
| DarkUxChallenge | ✅ | `darkux` | ✅ `darkux-cicd.yml` | ✅ | [darkux.alwayson.actor](https://darkux.alwayson.actor) | swedencentral, germanywestcentral |
| HelloAgents | ✅ | `helloagents` | ✅ `helloagents-cicd.yml` | ✅ | [agents.alwayson.actor](https://agents.alwayson.actor) | swedencentral, germanywestcentral |
| GraphOrleons | ✅ | `graphorleons` | ✅ `graphorleons-cicd.yml` | ✅ | [events.alwayson.actor](https://events.alwayson.actor) | swedencentral, germanywestcentral |
| HelloOrleons | ✅ | `helloorleons` | ✅ `helloorleons-cicd.yml` | ✅ | [hello.alwayson.actor](https://hello.alwayson.actor) | swedencentral, germanywestcentral |
| PlayersOn | ❌ | — | — | — | — | — |
| PlayersOnOrleans | ❌ | — | — | — | — | — |
| Orthereum | ❌ | — | — | — | — | — |

## Infrastructure Features

| Feature | Status | Details |
|---------|:------:|---------|
| Multi-region AKS stamps | ✅ | 2 regions (swedencentral, germanywestcentral), extensible |
| Cosmos DB multi-write | ✅ | Session consistency, continuous backup, autoscale |
| Azure Front Door | ✅ | Premium SKU (prod), health probes, custom domains |
| Flux GitOps | ✅ | Per-cluster config, image automation, postBuild substitution |
| Istio Gateway API | ✅ | mTLS, HTTPRoute per app, cert-manager integration |
| Image automation | ✅ | ACR polling (1 min), timestamp-based tag ordering, auto-commit |
| OpenTelemetry → App Insights | ✅ | Direct exporter APIs (ADR-0053), `DisableLocalAuth=true` |
| Prometheus metrics | ✅ | AMA scraping, Istio Envoy sidecar metrics |
| Health model | ✅ | `Microsoft.CloudHealth` (preview), [`az healthmodel`](src/az-healthmodel/) CLI extension with live TUI watch mode |
| Workload Identity | ✅ | Per-app managed identity, federated credentials, RBAC |
| cert-manager + external-dns | ✅ | Let's Encrypt TLS, auto DNS records in Azure DNS |
| Native AOT | ✅ | DarkUxChallenge (chiseled containers) |
| Azure AI Services | ✅ | GPT-4.1, GPT-4.1-mini, GPT-5.4 deployments |

## CI/CD Pipeline

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `darkux-cicd.yml` | Push to `src/DarkUxChallenge/**` | Build → TUnit tests (3x retry) → E2E → Docker build+push → Flux deploys |
| `helloagents-cicd.yml` | Push to `src/HelloAgents/**` | Build → TUnit tests (3x retry) → E2E → Docker build+push → Flux deploys |
| `graphorleons-cicd.yml` | Push to `src/GraphOrleons/**` | Build → TUnit tests (3x retry) → E2E → Docker build+push → Flux deploys |
| `helloorleons-cicd.yml` | Push to `src/HelloOrleons/**` | Build → TUnit tests (3x retry) → Docker build+push → Flux deploys |
| `app-build-push.yml` | Reusable (called by above) | Multi-arch Docker build (amd64/arm64 native), ACR push, manifest update |
| `azure-dev.yml` | Manual dispatch | `azd provision` + `azd deploy` for infrastructure |

Key features: OIDC authentication (no secrets), multi-arch native builds (no QEMU), test retry for flaky Cosmos emulator, Flux image automation for GitOps delivery.

## Documentation

- **51 ADRs** in [`docs/adr/`](docs/adr/README.md) — covering architecture, testing, deployment, security, and operational patterns
- **[TESTS.md](TESTS.md)** — functional requirements, NFRs (≥10k TPS, P99 <200ms, 99.99% availability), chaos engineering, security tests

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Aspire CLI](https://learn.microsoft.com/dotnet/aspire/fundamentals/cli): `dotnet tool install -g Aspire.Cli`
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Podman
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Node.js (LTS) — for React SPAs and Playwright E2E
- [ripgrep (rg)](https://github.com/BurntSushi/ripgrep) — fast code search
- [jq](https://jqlang.github.io/jq/) — JSON processing (API responses, CI scripts)
- [yq](https://github.com/mikefarah/yq) — YAML processing (K8s manifests, Flux configs)

### Getting Started

```bash
# Run any app locally (example: HelloAgents)
cd src/HelloAgents
cd HelloAgents.Web && npm ci && cd ..
aspire run --apphost HelloAgents.AppHost

# Deploy to Azure (one command)
azd auth login
azd up
```

See each app's README for detailed local development instructions.

## Deploy with Azure Developer CLI (`azd`)

`azd up` deploys the entire platform from your local machine in a single command — no hosted Git repository or Flux GitOps required.

### What `azd up` does

```
azd up
├── azd provision          Deploys all Azure infrastructure (AKS, ACR, Front Door, Cosmos DB, AI, ...)
│   └── postprovision      Enables Gateway API on AKS, gets cluster credentials, extracts deploy vars
├── azd deploy
│   ├── predeploy          Builds 6 Docker images remotely via `az acr build` (no Docker Desktop needed)
│   └── postdeploy         Applies K8s manifests via `kustomize build | envsubst | kubectl apply`
│                          Waits for rollout, verifies health, prints Front Door HTTPS endpoints
```

### Prerequisites (in addition to general prerequisites)

- [kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/) — renders K8s manifests
- `envsubst` — substitutes `${VAR}` patterns (included with `gettext`; `brew install gettext` on macOS)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — applies manifests to AKS

### Quick start

```bash
azd auth login
azd env new my-env --location swedencentral --subscription <subscription-id>
azd up
```

After ~15 minutes, all apps are live at their Front Door HTTPS endpoints (printed at the end).

### Deployment modes

Edit `infra/main.bicepparam` to control deployment mode:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enableFlux` | `true` | Enable Flux GitOps on AKS. Set `false` for local-only deployment via `azd`. |
| `enableCustomDomain` | `true` | Enable custom domain routing (DNS zones, CNAME records). Set `false` to use Front Door default endpoints. |

**Fully local deployment (no Git repo, no custom domain):**
```bicep
param enableFlux = false
param enableCustomDomain = false
```

**GitOps with custom domain (production):**
```bicep
param enableFlux = true
param enableCustomDomain = true
```

### Environment profiles

Switch profiles by editing the `env` variable in `infra/main.bicepparam`:

| Profile | Stamps | Regions | Cost |
|---------|--------|---------|------|
| `budget` | 1 | 1 (swedencentral) | Lowest — Serverless Cosmos, Free AKS tier, spot instances |
| `budgetDual` | 2 | 1 | Low — two stamps for testing multi-stamp behavior |
| `dev` | 2+ | 2+ | Higher — Provisioned Cosmos, Standard AKS, multi-region |

### Tear down

```bash
azd down --force --purge
```

### How it works (Flux-free mode)

When `enableFlux = false`, the `postdeploy` hook replaces Flux's reconciliation loop with a local equivalent:

1. **`kustomize build`** — renders the same `clusters/{region}/apps` kustomizations that Flux would
2. **`envsubst`** — substitutes `${VAR}` patterns using 49 variables from Bicep outputs (same as Flux's `postBuild.substitute`)
3. **`kubectl apply --server-side`** — applies directly to AKS (same as Flux's reconciliation)

This means existing K8s manifests in `clusters/` are used **unchanged** — no parallel set of manifests to maintain.

## Quick Start (CI/CD)

Infrastructure is deployed via the `Deploy Infrastructure` GitHub Actions workflow using Azure Developer CLI (`azd`) with OIDC federated credentials — no secrets stored in GitHub.

### One-time Setup

**Option A — automated (recommended):**
```bash
azd auth login
azd pipeline config --provider github
```
This creates the Entra app registration, federated credentials, and sets all required GitHub variables automatically.

**Option B — manual:**

1. Create an Entra ID app registration with a federated credential for GitHub Actions:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<org>/<repo>:environment:dev` (repeat for `prod`)

2. Grant the app **Contributor** + **User Access Administrator** on your subscription.

3. Set these **GitHub Environment variables** on each environment (`dev`, `prod`):

   | Variable | Value |
   |---|---|
   | `AZURE_CLIENT_ID` | App registration Client ID |
   | `AZURE_ENV_NAME` | e.g. `alwayson-dev` or `alwayson-prod` |
   | `AZURE_LOCATION` | e.g. `swedencentral` |

4. Set these **repository-level variables** (shared across environments):

   | Variable | Value |
   |---|---|
   | `AZURE_TENANT_ID` | Your Entra tenant ID |
   | `AZURE_SUBSCRIPTION_ID` | Target subscription ID |

5. Add a **required reviewer** to the `prod` GitHub Environment for approval gates.

### Flux GitOps — Deploy Key Setup

After the first `azd provision`, each AKS stamp gets a Flux configuration that syncs from this repo via SSH. Flux auto-generates an SSH key pair per stamp. To grant Flux read access, register the public keys as deploy keys:

### Current GitOps Implementation

The current implementation is:

- `azd provision` / `azd up` deploys each AKS stamp
- [infra/stamp.bicep](/Users/abossard/Desktop/projects/always_on_v2/infra/stamp.bicep) installs the Azure-managed Flux extension (`microsoft.flux`)
- The same Bicep file creates a `fluxConfiguration` named `cluster-config`
- Each cluster pulls and reconciles its own paths from Git:
   - `clusters/<region>/infra`
   - `clusters/<region>/apps`

This means GitOps is **distributed per cluster**. There is no Fleet hub in the steady-state critical path for reconciliation.

The file [bootstrap.sh](/Users/abossard/Desktop/projects/always_on_v2/bootstrap.sh) is a **manual fallback only**. It uses `flux bootstrap github`, but it is not part of the normal deployment flow.

### Changing The Git Source

The Git repository used by Flux is configured through the `fluxGitRepoUrl` parameter in [infra/main.bicep](/Users/abossard/Desktop/projects/always_on_v2/infra/main.bicep).

Today the default is an SSH GitHub URL. To point clusters at a different repository:

- change `fluxGitRepoUrl`
- ensure the target repo contains the expected `clusters/<region>/infra` and `clusters/<region>/apps` layout
- ensure Flux can authenticate to that repo if it is private
- redeploy the infrastructure so the `fluxConfiguration` resources are updated on the clusters

This does **not** require Fleet. The current implementation updates each cluster through the IaC that already owns the Flux configuration.

Fleet can still be added later for **mass orchestration** across clusters, but that is a separate concern:

- current implementation: Bicep owns the per-cluster Git source
- optional future Fleet usage: enforce or coordinate changes across many member clusters at once

So yes, Fleet can help with mass updates, but it is not how this repo currently wires GitOps.

**Automated (recommended):**

1. Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with:
   - **Repository access**: Only this repo
   - **Permissions**: Administration → Read and write
2. Add it as a repo secret named `DEPLOY_KEY_ADMIN_TOKEN`:
   ```bash
   gh secret set DEPLOY_KEY_ADMIN_TOKEN
   ```
3. Done — the `Provision & Deploy` workflow will automatically register the deploy keys after each provision.

**Manual fallback:**

If no PAT is configured, the workflow prints the SSH public keys to the **workflow run summary**. Copy each key and add it at:
Settings → Deploy keys → Add deploy key (read-only).

### Running a Deployment

Go to **Actions → Deploy Infrastructure → Run workflow**, choose `dev` or `prod`, and click **Run workflow**.

- `dev` deploys a single AKS stamp (Standard_B2ms, Free tier, public LB, Standard Front Door)
- `prod` deploys 3 stamps across 2 regions (Standard_D4s_v5, Standard tier, internal LB, Premium Front Door) — requires reviewer approval

### Switching Environments Locally

```bash
# Deploy dev
azd provision  # main.bicepparam points to dev by default

# Deploy prod (swap param file first)
cp infra/main.prod.bicepparam infra/main.bicepparam
azd provision
```

## Observability — OpenTelemetry & Application Insights

All applications use the `Azure.Monitor.OpenTelemetry.AspNetCore` distro (1.4.0) with `UseAzureMonitor()` and `DefaultAzureCredential` for managed identity auth. The shared `ServiceDefaults` project in each app configures the full OpenTelemetry pipeline (traces, metrics, logs) with automatic instrumentation for ASP.NET Core, HTTP clients, and runtime metrics. An `OtelDiagnosticsListener` captures export diagnostics to stdout for operational visibility.

## Roadmap — Steps to Production Readiness

### Phase 1: Operational Foundation
| # | Task | Apps Affected | Priority |
|---|------|---------------|----------|
| 1 | Verify App Insights traces, metrics, and logs flowing after ADR-0053 fix | All 4 deployed | 🔴 Critical |
| 2 | Fix HelloAgents 403 on Storage Queue (per-stamp storage RBAC) | HelloAgents | 🔴 Critical |
| 3 | Fix HelloAgents OpenAI 429 rate limits — increase `skuCapacity` or add retry/backoff | HelloAgents | 🟡 High |
| 4 | ~~Fix Level0 CrashLoopBackOff~~ | Removed | — |
| 5 | Update AMA Prometheus namespace regex to include all app namespaces | All | 🟡 High |

### Phase 2: Hardening
| # | Task | Details | Priority |
|---|------|---------|----------|
| 6 | Add E2E tests to HelloOrleons | Only deployed app without Playwright E2E | 🟡 High |
| 7 | Implement chaos engineering tests from TESTS.md | Pod failure, node failure, region failover | 🟡 High |
| 8 | Set up Azure Load Testing for NFR validation | Target: ≥10k TPS, P99 <200ms | 🟡 High |
| 9 | Add network policies per namespace | Zero-trust pod communication | 🟢 Medium |
| 10 | Configure App Insights alerts and dashboards | Error rate, latency P99, availability SLO | 🟢 Medium |

### Phase 3: Scale & Polish
| # | Task | Details | Priority |
|---|------|---------|----------|
| 11 | Deploy to 3+ regions (meet NFR geographic requirement) | Add westeurope or eastus stamp | 🟢 Medium |
| 12 | Onboard PlayersOnOrleans or Orthereum to K8s | Expand the deployed app portfolio | 🟢 Medium |
| 13 | Add Front Door health probes and failover testing | Validate multi-region routing works under failure | 🟢 Medium |
| 14 | Security hardening — trivy scanning, gitleaks in CI, container signing | SEC-03/SEC-04 from TESTS.md | 🟢 Medium |
| 15 | Performance soak test — 48h sustained 10k TPS | NFR from TESTS.md, memory leak detection | 🔵 Low |

## Architecture Decisions

All architecture decisions are documented as ADRs in [`docs/adr/`](docs/adr/README.md) (51 ADRs).

## References

- [Azure Architecture Center](https://learn.microsoft.com/azure/architecture/)
- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/)
- [Mission-Critical Architecture](https://learn.microsoft.com/azure/architecture/framework/mission-critical/mission-critical-overview)
- [Orleans Documentation](https://learn.microsoft.com/dotnet/orleans/)
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
