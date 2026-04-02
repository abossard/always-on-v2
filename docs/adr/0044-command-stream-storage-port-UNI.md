# ADR-0044: Command Stream Storage Port for Click Processing

## Status
Proposed

## Context
The current click endpoint uses an optimistic concurrency pattern: read player state, compute new state, write with ETag check, retry up to 3 times on conflict. This works for single-player scenarios but has structural issues:

1. **Read-before-write amplification** — every click requires a Cosmos read + write (2 RUs minimum), even when 100 clicks arrive in rapid succession for the same player.
2. **Conflicts are handled at the wrong layer** — the HTTP endpoint contains a retry loop that belongs closer to the storage.
3. **No batching opportunity** — each click is processed independently, missing the chance to collapse N clicks into a single Cosmos operation.
4. **Future Orleans migration** — the project roadmap includes moving to Orleans grains, where the storage pattern is inherently command-based (grain receives messages, processes sequentially, persists state). The current CRUD interface doesn't map cleanly to that model.

## Decision
Replace the current read-modify-write storage port with a **command submission interface**. The storage port accepts commands (what happened) rather than pre-computed state (what the new state is).

### New Interface

```csharp
// Commands describe intent — not resulting state
abstract record PlayerCommand;
record ClickCommand(DateTimeOffset Now, ClickRateSnapshot Rates) : PlayerCommand;
record AddScoreCommand(long Points) : PlayerCommand;
record UnlockAchievementCommand(string Id, string Name) : PlayerCommand;

// Result includes new state + domain events produced
record CommandResult(
    SaveOutcome Outcome,
    PlayerProgression? State,
    IReadOnlyList<PlayerEvent> Events);

// Storage port — accepts commands, owns the read-compute-write cycle
interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId id, CancellationToken ct);
    Task<CommandResult> SubmitCommand(PlayerId id, PlayerCommand command, CancellationToken ct);
}
```

### Endpoint Simplification

The click endpoint becomes a true fire-and-forget:

```csharp
static async Task<IResult> Click(string playerId, IPlayerProgressionStore store, ...)
{
    var result = await store.SubmitCommand(id, new ClickCommand(now, rates), ct);
    if (result.Outcome == SaveOutcome.Success)
        foreach (var evt in result.Events)
            await eventSink.PublishAsync(evt, ct);
    return Results.Accepted();
}
```

No retry loop — the storage implementation handles conflicts internally.

### Optional Batching Middleware

Between the endpoint and storage, a per-player command buffer can group rapid commands:

```
Endpoint → CommandBuffer (per PlayerId) → Storage Port
                ↓
          Waits 5-10ms or until N commands arrive
          Sends batch to storage
                ↓
          Storage: Read once → Apply all commands → Write once
          Returns individual results
```

This is effectively the **actor model** — one sequential mailbox per player. Conflicts become impossible because commands for the same player are serialized. This maps directly to how Orleans grains work.

### Orleans Migration Path

When migrating to Orleans:
- `IPlayerProgressionStore.SubmitCommand()` becomes a grain method call
- The grain holds state in memory (no read needed for hot players)
- Persistence happens on grain deactivation or periodic checkpointing
- The batching middleware becomes unnecessary — Orleans' turn-based concurrency provides it natively
- The command/event types remain unchanged

## Alternatives Considered

- **Keep optimistic concurrency with higher retry count** — Addresses the symptom (lost clicks) but not the root cause (read-before-write amplification). Doesn't help with batching or Orleans migration.
- **Use Cosmos stored procedures for atomic increment** — Eliminates read-before-write but couples the domain logic to Cosmos-specific implementation. Doesn't work with InMemory or Orleans.
- **Event sourcing with append-only log** — Pure event stream, reconstruct state on read. Architecturally clean but overkill for a click counter, and Cosmos isn't optimized for append-only patterns at this scale.

## Consequences

- **Positive**: Eliminates conflicts by design (serialized processing). Enables batching (N clicks → 1 Cosmos write). Simplifies endpoints (no retry loops). Maps cleanly to Orleans grains. Storage implementations remain simple — they just process one command at a time.
- **Negative**: Adds a small latency window for batching (5-10ms). Command processing logic moves into the storage layer, making it slightly more complex. Requires updating both InMemory and Cosmos implementations.

## References
- [Orleans Grains and Turn-Based Concurrency](https://learn.microsoft.com/en-us/dotnet/orleans/grains/)
- [ADR-0040: Orleans Ingress](0040-orleans-ingress-DI.md)
- [Actor Model and Command Processing](https://www.reactivemanifesto.org/)
