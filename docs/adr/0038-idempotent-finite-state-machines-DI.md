# ADR-0038: Idempotent Finite State Machines for State Verification

**Status:** Decided

## Context

- State changes requiring verification need a pattern that handles concurrency safely, is idempotent, and never leaves inconsistent state
- Without a deliberate pattern, validation logic scatters, locks don't survive restarts, and exceptions leave state half-updated

## Decision

- **Define states explicitly:** Use enums (e.g., `EscrowStatus { Open, Released, Refunded }`) — never strings or boolean flags
- **Guard transitions:** Every state transition validates preconditions and returns a result — never throws
- **Make transitions idempotent:** Duplicate events return current state unchanged (e.g., `WithAchievement` returns `this` if already unlocked)
- **Optimistic concurrency:** ETags prevent lost updates without locks — callers handle `Conflict` and retry
- **Return result types:** `SaveResult` with `SaveOutcome` enum — a conflict is a valid outcome, not an exception

```
Current State → Guard (valid transition?) → Yes: New State (new ETag) / No: Return current state (idempotent)
```

## Consequences

- Concurrent modifications handled gracefully — no data loss, no locks, no deadlocks
- Idempotency makes the system resilient to retries and duplicate messages
- State transitions are explicit and auditable in code
- Callers must handle `Conflict` results and implement retry logic (intentional)

## Links

- [ADR-0033: Coding Principles](0033-coding-principles-DI.md)
- [ADR-0037: Type-Safe Lookups](0037-type-safe-lookups-DI.md)
