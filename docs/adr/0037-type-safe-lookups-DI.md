# ADR-0037: Type-Safe Lookups — Eliminate Dictionary\<string, ...\>

## Status

Accepted

## Context

String-keyed lookups (`Dictionary<string, object>`, `config["key"]`, magic string comparisons) are a major source of runtime failures. They bypass the compiler — typos, wrong types, and missing keys only surface at runtime, often in production. The compiler should catch as many errors as possible at build time.

## Decision

### 1. Use Value Objects for Identifiers

Wrap primitive types in `readonly record struct` to prevent accidental swapping and enable compiler-enforced type safety:

```csharp
// Good — compiler prevents mixing PlayerId with a raw Guid or Score
public readonly record struct PlayerId(Guid Value)
{
    public static PlayerId New() => new(Guid.NewGuid());
    public static bool TryParse(string? input, [NotNullWhen(true)] out PlayerId? result) { ... }
}
public readonly record struct Score(long Value) { public Score Add(long points) => new(Value + points); }
public readonly record struct Level(int Value);

// Avoid — raw primitives everywhere
public Guid PlayerId { get; set; }
public long Score { get; set; }
public int Level { get; set; }
// Nothing stops you from writing: player.Score = player.Level; (compiles, wrong)
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs`

### 2. Parse Strings at System Boundaries Only

Strings enter the system at HTTP endpoints, configuration, and message queues. Convert them to typed values **immediately** at the boundary. From that point inward, only typed values flow:

```csharp
// Boundary — parse once, fail fast
static async Task<IResult> UpdatePlayer(string playerId, ...)
{
    if (!PlayerId.TryParse(playerId, out var id))
        return Results.Json(new ProblemResult("Invalid player ID format.", 400), ...);

    // From here on, 'id' is PlayerId — no more string handling
    var progression = await store.GetProgression(id.Value, ct);
}
```

### 3. Use Sealed Record Hierarchies Instead of String-Keyed Dispatch

When different operations need different handling, use a sealed record hierarchy with exhaustive pattern matching — not a `Dictionary<string, Action>` or string-based `switch`:

```csharp
// Good — compiler enforces exhaustiveness
public abstract record PolicyCommand;
public sealed record MintCommand(decimal Amount) : PolicyCommand;
public sealed record TokenTransferCommand(AccountAddress To, decimal Amount) : PolicyCommand;
public sealed record DepositCommand() : PolicyCommand;

return command switch
{
    MintCommand m => Mint(state, m),
    TokenTransferCommand t => Transfer(state, t),
    DepositCommand => Deposit(state, ctx),
    _ => new(state, PolicyResult.Failure($"Unknown command"))
};

// Avoid — runtime failures, no compiler help
var handlers = new Dictionary<string, Func<State, Task<Result>>>
{
    ["mint"] = MintHandler,
    ["transfer"] = TransferHandler,
    // Forgot "deposit"? Compiles fine, fails at runtime.
};
```

Reference: `src/Orthereum/Orthereum.Abstractions/Domain/PolicyCommand.cs`

### 4. Use Enums for Finite Known Values

When the set of values is known at compile time, use an enum:

```csharp
public enum StorageProvider { InMemory, CosmosDb }
public enum SaveOutcome { Success, Conflict, NotFound }
public enum EscrowStatus { Open, Released, Refunded }
```

### 5. Use Typed Configuration, Never Raw String Lookups

```csharp
// Good — typed, validated at startup
public sealed class CosmosOptions
{
    public string Endpoint { get; set; } = "";
    public string DatabaseName { get; set; } = "playersonlevel0";
}
services.AddOptions<CosmosOptions>()
    .Bind(configuration.GetSection("CosmosDb"))
    .Validate(o => !string.IsNullOrWhiteSpace(o.DatabaseName), "Required.")
    .ValidateOnStart();  // Crash on startup if invalid

// Avoid — silent null at runtime
var dbName = configuration["CosmosDb:DatabaseName"];  // null if missing, no compile-time check
```

Reference: `src/PlayersOnLevel0/PlayersOnLevel0.Api/Config.cs`

## Alternatives Considered

- **Raw primitives with naming conventions** — Rely on parameter names (`Guid playerId`, `long score`) to prevent misuse. The compiler doesn't enforce naming — parameters can still be swapped silently.
- **`Dictionary<string, object>` with constants** — Using `const string ScoreKey = "score"` reduces typos but doesn't prevent type mismatches (`(int)dict[ScoreKey]` when the value is `long`).
- **Dynamic types** — `dynamic` or `ExpandoObject` trades all compile-time safety for flexibility. Appropriate for scripting; never for production business logic.

## Consequences

- **Positive**: Entire categories of bugs (wrong ID type, missing key, type mismatch) become compile errors instead of runtime failures.
- **Positive**: IDE support (autocomplete, refactoring, find-all-references) works perfectly with typed values.
- **Positive**: Code is self-documenting — `PlayerId` communicates intent better than `Guid`.
- **Negative**: More types to define upfront. The overhead is minimal (~3 lines per value object) and pays for itself immediately.
- **Negative**: Serialization requires explicit handling (JSON source generators, custom converters). We already use `[JsonSerializable]` for AOT, so this is not additional work.

## References

- [ADR-0033: Coding Principles](0033-coding-principles-DI.md) — Immutable data, pure calculations
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Domain.cs` — Value objects: PlayerId, Score, Level
- `src/PlayersOnLevel0/PlayersOnLevel0.Api/Config.cs` — Typed options with ValidateOnStart
- `src/Orthereum/Orthereum.Abstractions/Domain/PolicyCommand.cs` — Sealed record hierarchy
