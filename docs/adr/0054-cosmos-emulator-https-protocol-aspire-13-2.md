# ADR-0054: Cosmos DB Emulator Dev Certificate Trust for Aspire 13.2

**Status:** Decided

## Context
- Aspire 13.2.1 upgrade broke all Cosmos integration tests in CI (100% failure rate)
- Three wrong theories investigated before finding root cause

## Decision
- **Root cause:** Aspire 13.2.1 `RunAsPreviewEmulator` auto-configures HTTPS + dev cert trust, but GitHub Actions has no trusted ASP.NET Core dev certificate → `AuthenticationException: PartialChain`
- **Fix:** Add `dotnet dev-certs https --trust` to CI workflow before tests
- No manual `PROTOCOL=https`, no `WaitBehavior` overrides — let Aspire handle everything

## Consequences
- Clean AppHost code with no workarounds; same fix applies to all apps
- Lesson: read framework source code first; don't apply fixes without understanding the mechanism
