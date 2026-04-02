# PlayersOnLevel0

[![Level0 CI/CD](https://github.com/abossard/always-on-v2/actions/workflows/level0-cicd.yml/badge.svg?branch=main)](https://github.com/abossard/always-on-v2/actions/workflows/level0-cicd.yml)
[![Deploy Infrastructure](https://github.com/abossard/always-on-v2/actions/workflows/azure-deploy.yml/badge.svg?branch=main)](https://github.com/abossard/always-on-v2/actions/workflows/azure-deploy.yml)
![.NET 10](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Azure Cosmos DB](https://img.shields.io/badge/Azure%20Cosmos%20DB-NoSQL-0078D4?logo=microsoftazure&logoColor=white)
![Playwright](https://img.shields.io/badge/Tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white)
![Native AOT](https://img.shields.io/badge/Native%20AOT-enabled-6B4CE6)

PlayersOnLevel0 is a small full-stack player progression and clicker application built to prove that production-style architecture does not need to be large or ceremony-heavy. It combines a .NET 10 minimal API, a React + Vite SPA, Aspire-based local orchestration, Cosmos DB support, Playwright E2E coverage, and Native AOT publishing for the API.

The API runs with `InMemory` storage by default for simple local work. The Aspire AppHost switches the stack to a local Cosmos DB emulator so the full system can be exercised end to end.

## Overview

- Minimal REST API for player progression, score, level, achievements, and click tracking.
- React SPA for the clicker UX and API docs experience.
- Aspire AppHost for local orchestration of API, SPA, Cosmos emulator, and E2E tests.
- TUnit integration tests and Playwright E2E tests.
- Native AOT API publishing with Cosmos-specific trimming support.

## Solution Layout

| Project | Purpose |
|---|---|
| [PlayersOnLevel0.Api](PlayersOnLevel0.Api/) | Minimal API, domain logic, storage adapters, SSE/event plumbing |
| [PlayersOnLevel0.SPA.Web](PlayersOnLevel0.SPA.Web/) | React 19 + Vite frontend |
| [PlayersOnLevel0.AppHost](PlayersOnLevel0.AppHost/) | Aspire orchestrator for local development |
| [PlayersOnLevel0.ServiceDefaults](PlayersOnLevel0.ServiceDefaults/) | OpenTelemetry, health checks, shared service wiring |
| [PlayersOnLevel0.Tests](PlayersOnLevel0.Tests/) | TUnit unit/integration-style backend tests |
| [PlayersOnLevel0.E2E](PlayersOnLevel0.E2E/) | Playwright end-to-end tests |

## Local Development

### Prerequisites

- .NET 10 SDK
- Node.js
- Docker Desktop or compatible container runtime
- Aspire workload: `dotnet workload install aspire`

### Run The Full Stack

```bash
cd src/PlayersOnLevel0

cd PlayersOnLevel0.SPA.Web && npm ci
cd ../PlayersOnLevel0.E2E && npm ci
cd ..

dotnet run --project PlayersOnLevel0.AppHost
```

Local endpoints:

- SPA: `http://localhost:4200`
- API: `http://localhost:5036`
- Aspire dashboard: `http://localhost:17178`

### Run The API Only

```bash
cd src/PlayersOnLevel0
dotnet run --project PlayersOnLevel0.Api
```

This uses the default configuration from [PlayersOnLevel0.Api/appsettings.json](PlayersOnLevel0.Api/appsettings.json), which starts with `InMemory` storage.

## Testing

### Backend Tests

```bash
cd src/PlayersOnLevel0
dotnet restore
dotnet build
dotnet run --project PlayersOnLevel0.Tests --no-build
```

### Playwright E2E

Start the AppHost first, then run:

```bash
cd src/PlayersOnLevel0/PlayersOnLevel0.E2E
npx playwright test
```

Useful scripts from [PlayersOnLevel0.E2E/package.json](PlayersOnLevel0.E2E/package.json):

- `npm test`
- `npm run test:headed`
- `npm run report`

## CI And Deployment

- App CI/CD workflow: [level0-cicd.yml](../../.github/workflows/level0-cicd.yml)
- Infrastructure deployment workflow: [azure-deploy.yml](../../.github/workflows/azure-deploy.yml)
- Kubernetes deployment manifest: [deployment.yaml](../../clusters/base/apps/level0/deployment.yaml)

The Level0 CI/CD workflow runs:

- unit and integration tests with retry
- Playwright E2E tests
- container build and push on `main`
- manifest update through the shared reusable workflow

## Architecture Notes

- API project: minimal hexagonal structure centered on [Domain.cs](PlayersOnLevel0.Api/Domain.cs), [Endpoints.cs](PlayersOnLevel0.Api/Endpoints.cs), and [Storage.cs](PlayersOnLevel0.Api/Storage.cs)
- Local Cosmos orchestration: [PlayersOnLevel0.AppHost/Program.cs](PlayersOnLevel0.AppHost/Program.cs)
- Native AOT and Cosmos trimmer roots: [PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj](PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj) and [PlayersOnLevel0.Api/TrimmerRoots.xml](PlayersOnLevel0.Api/TrimmerRoots.xml)

Relevant ADRs:

- [ADR-0027: PlayersOnLevel0 Lightweight API](../../docs/adr/0027-playeronlevel0-lightweight-api-DI.md)
- [ADR-0035: Simplified Hexagonal Architecture](../../docs/adr/0035-simplified-hexagonal-architecture-DI.md)
- [ADR-0039: Matrix Testing](../../docs/adr/0039-matrix-testing-DI.md)
- [ADR-0042: Level0 Integration-Only Testing](../../docs/adr/0042-level0-integration-only-testing-DI.md)
- [ADR-0046: Native AOT for PlayersOnLevel0 API](../../docs/adr/0046-native-aot-for-level0-api-DI.md)

## Related Files

- [CLICKER_PLAN.md](CLICKER_PLAN.md)
- [REVIEW.md](REVIEW.md)
