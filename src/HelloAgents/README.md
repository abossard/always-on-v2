# HelloAgents

[![HelloAgents CI/CD](https://github.com/abossard/always-on-v2/actions/workflows/helloagents-cicd.yml/badge.svg?branch=main)](https://github.com/abossard/always-on-v2/actions/workflows/helloagents-cicd.yml)
![.NET 10](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Orleans](https://img.shields.io/badge/Orleans-10-6B4CE6?logo=dotnet&logoColor=white)
![Playwright](https://img.shields.io/badge/Tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white)

Multi-agent AI chat groups powered by a **stream-driven Orleans architecture**. Users create chat groups, add AI agents with distinct personas, and watch them discuss autonomously. All coordination flows through Orleans Streams — no grain-to-grain RPC calls for message flow.

## Architecture

The system uses three grain types connected by Orleans Streams:

| Grain | Role |
|---|---|
| **ChatGroupGrain** | Reactive consumer — persists messages and membership from its own group stream |
| **AgentGrain** | Autonomous actor — subscribes to group streams, decides when to respond, spawns intent grains |
| **LlmIntentGrain** | Ephemeral worker — persists intent before LLM call (durability), publishes result to agent stream, self-destructs |

Stream topology:
- `group:{groupId}` — carries messages, join/leave events. Published by API endpoints and agent grains.
- `agent:{agentId}` — carries LLM results from intent grains back to the owning agent.

See [STREAM-ARCHITECTURE-PLAN.md](STREAM-ARCHITECTURE-PLAN.md) for the full design document.

## Solution Layout

| Project | Purpose |
|---|---|
| [HelloAgents.Api](HelloAgents.Api/) | Minimal API, Orleans silo, grain implementations, LLM integration |
| [HelloAgents.Web](HelloAgents.Web/) | Next.js React frontend with SSE real-time updates |
| [HelloAgents.AppHost](HelloAgents.AppHost/) | Aspire orchestrator (Cosmos DB + Azure Queue Storage emulators) |
| [HelloAgents.AppHost.Local](HelloAgents.AppHost.Local/) | Aspire orchestrator (in-memory, no Docker, optional LM Studio) |
| [HelloAgents.ServiceDefaults](HelloAgents.ServiceDefaults/) | OpenTelemetry, health checks, Azure Monitor |
| [HelloAgents.Tests](HelloAgents.Tests/) | TUnit backend tests (in-memory + Cosmos matrix) |
| [HelloAgents.E2E](HelloAgents.E2E/) | Playwright E2E tests (26 tests including SSE verification) |

## Local Development

### Prerequisites

- .NET 10 SDK
- Node.js (LTS)
- Aspire CLI: `dotnet tool install -g Aspire.Cli`
- Aspire workload: `dotnet workload install aspire`
- Optional: [LM Studio](https://lmstudio.ai/) for local LLM (otherwise uses NoOp placeholder)

### Run the Full Stack (Aspire CLI)

```bash
cd src/HelloAgents

# Install frontend dependencies
cd HelloAgents.Web && npm ci && cd ..
cd HelloAgents.E2E && npm ci && cd ..

# Start everything
aspire run --apphost HelloAgents.AppHost.Local

# The Aspire dashboard shows all resource URLs.
# API and Web ports are assigned dynamically.
```

### Run the Full Stack (with LM Studio)

Start LM Studio, load a model (e.g., `liquid/lfm2.5-1.2b`), then:

```bash
OPENAI_ENDPOINT=http://localhost:1234/v1 aspire run --apphost HelloAgents.AppHost.Local
```

Agents will respond with real LLM output instead of "(AI not configured)".

### Run the API Only

```bash
cd src/HelloAgents
dotnet run --project HelloAgents.Api
```

Uses in-memory storage and NoOp LLM client. API available at `http://localhost:5100`.

## Testing

### Backend Tests (TUnit)

```bash
cd src/HelloAgents
dotnet run --project HelloAgents.Tests
```

Runs 11 tests against the in-memory backend. For Cosmos DB tests, use the `cosmos` category with the full AppHost.

### Playwright E2E (via Aspire CLI)

```bash
cd src/HelloAgents

# Start the stack in the background
aspire run --apphost HelloAgents.AppHost.Local --detach

# Wait for services, then run E2E
aspire wait api
aspire wait web
aspire resource e2e start
aspire wait e2e --status down --timeout 300

# Stop when done
aspire stop
```

The 26 E2E tests cover:
- Layout, group/agent CRUD, chat messaging
- SSE delivery (message, agent join/leave, discussion, ordering)
- Multi-tab real-time (cross-tab message delivery via SSE)
- API endpoints (health, CRUD lifecycle, membership, validation)

### Playwright E2E (manual)

```bash
# Start the stack
aspire run --apphost HelloAgents.AppHost.Local --detach
aspire wait api && aspire wait web

# Run Playwright directly (Aspire injects services__web__http__0 and services__api__http__0)
cd HelloAgents.E2E
npx playwright test --headed  # or: npm test
```

## CI and Deployment

- **CI/CD workflow:** [helloagents-cicd.yml](../../.github/workflows/helloagents-cicd.yml)
  - Build & TUnit tests → Playwright E2E via Aspire CLI → Multi-arch Docker build → Flux deploys
- **K8s manifest:** [deployment.yaml](../../clusters/base/apps/helloagents/deployment.yaml)
- **Infrastructure:** [infra/apps/helloagents/](../../infra/apps/helloagents/)
- **Live:** [agents.alwayson.actor](https://agents.alwayson.actor)
