# ADR-0036: File Organization — Combine What Belongs Together

**Status:** Decided

## Context

- C# convention of "one class per file" fragments cohesive concepts across many tiny files
- Understanding a single concept (e.g., player progression) requires opening 15+ files
- Complexity comes from the number of things a developer must hold in their head

## Decision

- **Group related types in the same file** when they form a cohesive unit — always used, modified, and understood together
- **`Domain.cs`** (~154 lines): all value objects, aggregate, validation, request/response types for one capability
- **`Storage.cs`** (~250 lines): port interface, result types, all adapter implementations, document types
- **Split when:** file exceeds ~300 lines, two developers frequently conflict, or a type is reused across modules
- **Don't split when:** a type is only used by one other type in the same file, or splitting creates sub-30-line files

## Consequences

- Opening `Domain.cs` shows the complete domain model — no hunting across files
- Code reviews see full context in one diff
- Fewer files = less project noise, faster navigation
- Developers trained on "one class per file" may push back — point them at 5 files vs. 30 for same functionality

## Links

- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php)
- [ADR-0035: Simplified Hexagonal Architecture](0035-simplified-hexagonal-architecture-DI.md)
