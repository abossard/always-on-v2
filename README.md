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

## References

- [Azure Architecture Center](https://learn.microsoft.com/azure/architecture/)
- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/)
- [Mission-Critical Architecture](https://learn.microsoft.com/azure/architecture/framework/mission-critical/mission-critical-overview)
- [Orleans Documentation](https://learn.microsoft.com/dotnet/orleans/)
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
