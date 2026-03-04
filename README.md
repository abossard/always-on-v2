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

## Architecture Decisions

All architecture decisions are documented as ADRs in [`docs/adr/`](docs/adr/README.md).

## References

- [Azure Architecture Center](https://learn.microsoft.com/azure/architecture/)
- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/)
- [Mission-Critical Architecture](https://learn.microsoft.com/azure/architecture/framework/mission-critical/mission-critical-overview)
- [Orleans Documentation](https://learn.microsoft.com/dotnet/orleans/)
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
