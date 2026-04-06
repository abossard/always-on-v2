# ADR-0054: Cosmos DB Emulator Dev Certificate Trust for Aspire 13.2

**Status:** Accepted
**Date:** 2026-04-06
**Decision makers:** Andre Bossard, Copilot

## Context

After upgrading from Aspire 13.1.2 to 13.2.1, all Cosmos DB integration tests failed in CI
(HelloAgents, PlayersOnLevel0, DarkUxChallenge). CI passed 8/9 times with 13.1.2, failed 100%
with 13.2.1.

## Investigation (6 CI runs, 3 wrong theories)

1. **~~Health check timeout~~** — Wrong. Docker diagnostics showed the emulator boots in 36s
   and is fully ready. Applied `WaitBehavior.WaitOnResourceUnavailable` — didn't help.

2. **~~Protocol mismatch~~** — Partially right. The vnext-preview emulator defaults to HTTP.
   Added `PROTOCOL=https` manually. Error changed from `Cannot determine the frame size`
   to `PartialChain`. But this was the wrong fix — Aspire already sets PROTOCOL internally.

3. **~~WaitFor behavior~~** — Wrong. Applied `DefaultWaitBehavior = WaitOnResourceUnavailable`.
   Didn't help because the API was crashing on startup (cert issue), not timing out.

## Root Cause

Aspire 13.2.1's `RunAsPreviewEmulator` auto-configures HTTPS + dev certificate + cert trust
(confirmed by reading the Aspire source: `AzureCosmosDBExtensions.cs`). On GitHub Actions
ubuntu-latest, there is no trusted ASP.NET Core dev certificate. CI log:
`No trusted Aspire development certificate was found.` Without it, the HTTPS setup is
incomplete and the API crashes with `AuthenticationException: PartialChain`.

## Decision

Add `dotnet dev-certs https --trust` to the CI workflow before running tests.
No manual `PROTOCOL=https`, no `WaitBehavior` overrides. Let Aspire handle everything.

## Consequences

- All workarounds reverted: clean `.WaitFor(cosmos)`, clean `WaitForResourceHealthyAsync(name)`
- CI workflow gets one new step: `dotnet dev-certs https --trust`
- AppHost code is vanilla Aspire — no workarounds
- Same fix applies to all three apps

## Lessons Learned

1. **Read the framework source code first.** Aspire already handles HTTPS + cert trust.
   Our manual overrides conflicted with the framework.
2. **Read the full error chain.** Different inner exceptions = different problems.
3. **Docker diagnostics are essential.** Without container logs we'd still be guessing.
4. **Don't fix what you don't understand.** We applied 5 "fixes" based on theories
   instead of understanding the mechanism first.
