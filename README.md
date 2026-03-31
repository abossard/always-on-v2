# AlwaysOn v2 – Player Progression API

A hands-on learning framework for senior software engineers: design, build, and operate a **globally distributed, mission-critical** application on Microsoft Azure.

## Architecture Overview

| Layer              | Technology                                     |
|--------------------|------------------------------------------------|
| **Compute**        | Azure Kubernetes Service (AKS)                 |
| **Framework**      | .NET + Orleans (virtual actor model)           |
| **Architecture**   | Event-driven (Azure Service Bus / Event Hubs)  |
| **Database**       | Azure Cosmos DB (NoSQL, multi-region writes)   |
| **Caching**        | Azure Cache for Redis                          |
| **Observability**  | Application Insights + Prometheus + Grafana    |
| **Load Balancing** | Azure Front Door                               |
| **Secrets**        | Azure Key Vault                                |
| **IaC**            | Bicep (via Azure Developer CLI)                |
| **CI/CD**          | GitHub Actions                                 |

## Project Structure

```
├── azure.yaml              # Azure Developer CLI project definition
├── TESTS.md                # Functional & non-functional test requirements
├── docs/adr/               # Architecture Decision Records
├── infra/                  # Bicep infrastructure-as-code
│   ├── main.bicep
│   └── modules/
├── src/                    # Application source code
│   └── AlwaysOn.PlayerProgression/
│       ├── src/
│       │   ├── AlwaysOn.Api/           # ASP.NET Core host + Orleans silo
│       │   ├── AlwaysOn.Domain/        # Domain models
│       │   ├── AlwaysOn.GrainInterfaces/  # Orleans grain interfaces
│       │   ├── AlwaysOn.Grains/        # Orleans grain implementations
│       │   └── AlwaysOn.Infrastructure/   # Persistence & messaging
│       └── tests/
├── k8s/                    # Kubernetes manifests
└── .github/workflows/      # CI/CD pipelines
```

## Quick Start

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Podman
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

### Getting Started

```bash
# Clone and navigate
cd always_on_v2

# Restore and build
dotnet build src/AlwaysOn.PlayerProgression/AlwaysOn.PlayerProgression.sln

# Run locally
dotnet run --project src/AlwaysOn.PlayerProgression/src/AlwaysOn.Api

# Deploy to Azure
azd auth login
azd up
```

## API Endpoints

| Method   | Endpoint                        | Description                    |
|----------|---------------------------------|--------------------------------|
| `GET`    | `/api/players/{playerId}`       | Retrieve player progression    |
| `POST`   | `/api/players/{playerId}`       | Create player progression      |
| `PUT`    | `/api/players/{playerId}`       | Update player progression      |
| `GET`    | `/health`                       | Health check                   |
| `GET`    | `/health/ready`                 | Readiness probe                |

## Learning Path

| Level | Focus                          | Target TPS |
|-------|--------------------------------|------------|
| 1     | Single Region Foundation       | 1,000+     |
| 2     | Production Operationalization  | 5,000+     |
| 3     | Multi-Region Global Scale      | 10,000+    |
| 4     | Validation & Presentation      | All NFRs   |
| 5     | Advanced Topics (Optional)     | —          |

## Deploying Infrastructure

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

## Architecture Decisions

All architecture decisions are documented as ADRs in [`docs/adr/`](docs/adr/README.md).

## Observability — OpenTelemetry & Application Insights

All applications use [OpenTelemetry](https://opentelemetry.io/docs/languages/dotnet/) with the Azure Monitor exporter to send traces, metrics, and logs to Application Insights. The shared `ServiceDefaults` project in each app configures the pipeline.

> **Version compatibility:** `Azure.Monitor.OpenTelemetry.AspNetCore` 1.4.0 transitively pulls in `Azure.Monitor.OpenTelemetry.Exporter` 1.5.0, which only supports OpenTelemetry SDK ≤1.14.x. Since we use OpenTelemetry 1.15.x, we pin `Azure.Monitor.OpenTelemetry.Exporter` to **1.7.0** explicitly in each `Directory.Packages.props`. Without this override, the exporter **silently fails** and zero telemetry reaches App Insights. See the [exporter changelog](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/monitor/Azure.Monitor.OpenTelemetry.Exporter/CHANGELOG.md) for version compatibility details.

## References

- [Azure Architecture Center](https://learn.microsoft.com/azure/architecture/)
- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/)
- [Mission-Critical Architecture](https://learn.microsoft.com/azure/architecture/framework/mission-critical/mission-critical-overview)
- [Orleans Documentation](https://learn.microsoft.com/dotnet/orleans/)
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
