# PlayersOnOrleons

Minimal Orleans + Aspire alternative to PlayersOnLevel0.

## Shape

- `PlayersOnOrleons.Api` co-hosts ASP.NET Core Minimal APIs and a single Orleans silo.
- `PlayersOnOrleons.Abstractions` contains the grain contract and serialized state types.
- `PlayersOnOrleons.AppHost` is Aspire dev-time orchestration only.
- `PlayersOnOrleons.ServiceDefaults` provides health checks, OpenTelemetry, and OpenAPI.
- `PlayersOnOrleons.Tests` keeps one Aspire smoke test and one pure domain test.

## Runtime Choices

- One grain per player: `IPlayerGrain`.
- In-memory grain storage for local development.
- `UseLocalhostClustering()` to keep the first cut operationally trivial.
- Two endpoints only:
  - `GET /api/players/{playerId}`
  - `POST /api/players/{playerId}/click`

## Why This Exists

PlayersOnLevel0 proves that a production-grade API can stay simple without Orleans.
PlayersOnOrleons is the actor-based sibling: same problem shape, but with per-player serialized updates and a clear upgrade path toward distributed grains when that tradeoff is actually wanted.

## Next Steps

- Add persistent grain storage once the API shape is stable.
- Split grains only if profiling shows real contention.
- Reuse the existing repo deployment patterns if this variant graduates beyond local exploration.