# ADR-0038: Idempotent Finite State Machines for State Verification

## Status

Accepted

## Context

When a change in state requires verification (e.g., ensuring a player's score was updated correctly, or an escrow was released only once), we need a pattern that:

1. Handles concurrent modifications safely
2. Is **idempotent** — applying the same event twice produces the same result
3. Accepts events/inputs at any time — the system evolves the state or ignores the input
4. Never leaves the system in an inconsistent state

Without a deliberate pattern, developers scatter validation logic across services, use locks (which don't survive process restarts), or throw exceptions that leave state half-updated.

## Decision

### Model State Changes as Idempotent Finite State Machines

When a business operation involves state transitions that must be verified, build an idempotent FSM:

### 1. Define States Explicitly

Use enums or discriminated unions — never strings or boolean flags:

```csharp
// Explicit states — compiler knows all possible values
public enum EscrowStatus { Open, Released, Refunded }

// State includes all data needed to make transition decisions
public sealed record EscrowState(
    AccountAddress Depositor,
    AccountAddress Beneficiary,
    decimal Amount,
    EscrowStatus Status) : PolicyData;
```

Reference: `src/Orthereum/Orthereum.Grains/Policies/EscrowPolicy.cs`

### 2. Guard Transitions with Precondition Checks

Every state transition validates that the current state allows it. Invalid transitions return a result — they never throw:

```csharp
private static PolicyExecution Release(EscrowState s, PolicyExecutionContext ctx)
{
    // Guard: can only release from Open
    if (s.Status != EscrowStatus.Open)
        return new(s, PolicyResult.Failure("Escrow is not open"));

    // Transition: Open → Released
    var newState = s with { Amount = 0, Status = EscrowStatus.Released };
    return new(newState, PolicyResult.Ok([new Signal(..., "Released", new ReleasedSignal(...))]));
}
```

### 3. Make Transitions Idempotent

Events and inputs can arrive at any time (retries, duplicates, out-of-order delivery). The FSM either evolves or stays unchanged:

```csharp
// Idempotent achievement unlock — applying the same event twice is safe
public PlayerProgression WithAchievement(string id, string name)
{
    if (Achievements.Any(a => a.Id == id))
        return this;  // Already unlocked — return unchanged (idempotent)

    return this with
    {
        Achievements = [..Achievements, new Achievement(id, name, DateTimeOffset.UtcNow)],
        UpdatedAt = DateTimeOffset.UtcNow
    };
}
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs`

### 4. Use Optimistic Concurrency for Persistence

ETags (version tokens) prevent lost updates without locks:

```csharp
public enum SaveOutcome { Success, Conflict, NotFound }
public sealed record SaveResult(SaveOutcome Outcome, PlayerProgression? Progression = null, string? Error = null);

// In-memory adapter: version counter simulates ETags
if (current.Version != expectedVersion)
    return new SaveResult(SaveOutcome.Conflict, Error: "ETag mismatch — another update occurred.");

// Cosmos DB adapter: native ETag support
catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
    return new SaveResult(SaveOutcome.Conflict, Error: "ETag mismatch — another update occurred.");
```

The caller receives `Conflict` and can re-fetch → re-apply → retry. No data is lost.

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Storage.cs`

### 5. Return Result Types, Not Exceptions

State transition outcomes are **expected** — a conflict is not an error, it's a valid outcome:

```csharp
// Good — outcome is data, caller pattern-matches
return result.Outcome switch
{
    SaveOutcome.Success  => Results.Json(PlayerResponse.From(result.Progression!), ...),
    SaveOutcome.Conflict => Results.Json(new ProblemResult(result.Error!, 409), statusCode: 409),
    SaveOutcome.NotFound => Results.Json(new ProblemResult("Player not found.", 404), statusCode: 404),
    _ => Results.Json(new ProblemResult("Unexpected error.", 500), statusCode: 500)
};

// Avoid — exceptions for expected business outcomes
try { await store.Save(player); }
catch (ConcurrencyException) { ... }  // Exception for a normal scenario
```

### Summary: The FSM Pattern

```
┌─────────────┐     event/input     ┌──────────────────┐
│ Current     │ ──────────────────► │ Guard:            │
│ State       │                     │ Valid transition? │
│ (with ETag) │                     └────────┬─────────┘
└─────────────┘                              │
                                    ┌────────┼─────────┐
                                    │ Yes               │ No
                                    ▼                   ▼
                              ┌───────────┐     ┌──────────────┐
                              │ New State │     │ Return       │
                              │ (new ETag)│     │ current state│
                              └───────────┘     │ (idempotent) │
                                                └──────────────┘
```

## Alternatives Considered

- **Pessimistic locking** — Database locks or distributed locks (Redis). Locks don't survive process restarts, create deadlock risks, and reduce throughput. Optimistic concurrency via ETags is simpler and scales better.
- **Event sourcing** — Store all events, derive state by replaying. Powerful but adds significant complexity (event store, projections, snapshots). Overkill when the state itself is small and the transition logic is simple.
- **Boolean flags** (`isReleased`, `isRefunded`) — Two booleans create 4 states (including the invalid `isReleased && isRefunded`). An enum has exactly the valid states. Always prefer enums over boolean combinations.
- **Throwing exceptions on invalid transitions** — Exceptions are for unexpected failures. A duplicate event arriving at a Released escrow is *expected* — returning the current state unchanged is the correct response, not an exception.

## Consequences

- **Positive**: Concurrent modifications are handled gracefully — no data loss, no locks, no deadlocks.
- **Positive**: Idempotency makes the system resilient to retries and duplicate messages.
- **Positive**: State transitions are explicit and auditable — you can see all valid transitions in the code.
- **Positive**: The same pattern works for both in-memory (dev) and distributed (prod) systems.
- **Negative**: Callers must handle `Conflict` results and implement retry logic. This is intentional — the caller knows the retry strategy (immediate, backoff, fail).
- **Negative**: More verbose than "just save it" — but the verbosity captures essential business rules about state validity.

## References

- [ADR-0033: Coding Principles](0033-coding-principles-DI.md) — No exceptions for expected failures
- [ADR-0037: Type-Safe Lookups](0037-type-safe-lookups-DI.md) — Enums over strings for states
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Storage.cs` — SaveResult/SaveOutcome, ETag-based concurrency
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs` — Idempotent WithAchievement
- `src/Orthereum/Orthereum.Grains/Policies/EscrowPolicy.cs` — EscrowStatus FSM (Open → Released/Refunded)
