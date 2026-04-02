# ADR-0043: Event Reactors for Achievement Evaluation

## Status
Proposed

## Context
Currently, click achievements are evaluated inside `PlayerProgression.WithClick()` — the same method that increments the click counter. This couples three concerns into one state transition:

1. **Counter mutation**: `totalClicks + 1`
2. **Achievement evaluation**: Compare thresholds against new count + click rate
3. **State persistence**: Both counter and achievements saved as one document

This coupling means:
- The storage port must understand achievements to save them (leaks domain logic)
- `ApplyClick` on the storage port executes domain calculations inside its retry loop
- A simpler storage backend (like Redis `HINCRBY`) can't be used because the save includes achievements
- Achievement rules can't be changed without touching the storage path

The `ClickAchievementEvaluator.Evaluate()` function is already pure and stateless — it takes (totalClicks, rates, existingAchievements, now) and returns the full list. The problem is *where* it's called, not *how* it's implemented.

## Decision
Separate achievement evaluation from state mutation by introducing **Event Reactors** — pure functions that observe events produced by storage operations and derive higher-order events (like achievement awards).

### Architecture

```
Endpoint
  ↓
store.ApplyClick(id, now)          → [ClickRecorded { totalClicks: 42 }]
  ↓
AchievementReactor.React(events)   → [ClickAchievementEarned { tier: 1 }]  (if threshold crossed)
  ↓
store.SaveAchievements(id, new)    → (only when achievements change — rare)
  ↓
eventSink.PublishAll(allEvents)     → SSE to clients
```

### Event Reactor Interface

```csharp
/// Pure function: observes events, produces derived events.
/// No side effects, no storage access, fully testable.
interface IEventReactor
{
    IReadOnlyList<PlayerEvent> React(
        IReadOnlyList<PlayerEvent> sourceEvents,
        PlayerProgression currentState);
}
```

### Achievement Reactor Implementation

```csharp
class ClickAchievementReactor : IEventReactor
{
    public IReadOnlyList<PlayerEvent> React(
        IReadOnlyList<PlayerEvent> sourceEvents,
        PlayerProgression currentState)
    {
        var derived = new List<PlayerEvent>();

        foreach (var evt in sourceEvents)
        {
            if (evt is ClickRecorded click)
            {
                var rates = /* from rate tracker or from event metadata */;
                var evaluated = ClickAchievementEvaluator.Evaluate(
                    click.TotalClicks, rates,
                    currentState.ClickAchievements, click.OccurredAt);

                foreach (var earned in evaluated)
                    if (!currentState.ClickAchievements.Any(
                        a => a.AchievementId == earned.AchievementId && a.Tier == earned.Tier))
                        derived.Add(new ClickAchievementEarned(
                            click.PlayerId, earned.AchievementId, earned.Tier, click.OccurredAt));
            }
        }
        return derived;
    }
}
```

### Reactor Pipeline

```csharp
// Composable: chain multiple reactors
class ReactorPipeline
{
    readonly IEventReactor[] _reactors;

    public IReadOnlyList<PlayerEvent> Process(
        IReadOnlyList<PlayerEvent> events, PlayerProgression state)
    {
        var all = new List<PlayerEvent>(events);
        foreach (var reactor in _reactors)
            all.AddRange(reactor.React(all, state));
        return all;
    }
}
```

Multiple reactors can be added over time (leaderboard, daily challenges, streaks) without changing the storage port or the click endpoint.

### Simplified Storage Port

With achievements decoupled, `ApplyClick` only handles the counter:

```csharp
interface IPlayerProgressionStore
{
    Task<PlayerProgression?> GetProgression(PlayerId id, CancellationToken ct);
    Task<ClickApplyResult> ApplyClick(PlayerId id, DateTimeOffset now, CancellationToken ct);
    Task SaveAchievements(PlayerId id, IReadOnlyList<ClickAchievement> achievements, CancellationToken ct);
    Task<SaveResult> SaveProgression(PlayerProgression progression, CancellationToken ct);
}
```

Redis adapter: `HINCRBY totalClicks 1` — done. No achievements in the hot path.
Cosmos adapter: Same optimistic update but simpler — only counter fields.
Orleans grain: Process click message, emit event, reactors run in the same turn.

## Alternatives Considered

- **Keep achievements in WithClick()** — Works today but prevents simpler storage backends (Redis HINCRBY) and couples domain rules to the persistence cycle. Every storage adapter must handle achievements.
- **Lua scripts in Redis for atomic achievement evaluation** — Moves domain logic into Redis, untestable in C#, storage-specific.
- **Separate achievement microservice** — Overkill for this scale. The reactor pattern gives the same decoupling without network boundaries.

## Consequences

- **Positive**: Storage port becomes simpler (just counters). Achievement logic is a pure, testable function. New reactors can be added without touching storage. Enables Redis `HINCRBY` for the hot path. Maps naturally to Orleans grain event handling.
- **Negative**: Two-phase write for achievements (counter first, achievements second) — acceptable since achievement changes are rare (only at threshold crossings). Slightly more complex endpoint orchestration (pipeline instead of single call).

## References
- [ADR-0042: Command Stream Storage Port](0042-command-stream-storage-port-UNI.md)
- [Reactive Extensions / Event Processing Patterns](https://www.reactivemanifesto.org/)
- Current implementation: `ClickAchievementEvaluator.Evaluate()` in Domain.cs (already pure)
