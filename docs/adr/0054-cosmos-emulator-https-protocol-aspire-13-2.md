# ADR-0054: Cosmos DB Emulator HTTPS Protocol Fix for Aspire 13.2

**Status:** Accepted  
**Date:** 2026-04-06  
**Decision makers:** Andre Bossard, Copilot  

## Context

After upgrading from Aspire 13.1.2 to 13.2.1, all Cosmos DB integration tests (across HelloAgents, PlayersOnLevel0, and DarkUxChallenge) failed with:

```
System.Net.Http.HttpRequestException: The SSL connection could not be established
  → AuthenticationException: Cannot determine the frame size or a corrupted frame was received.
```

This was initially misdiagnosed through 6 CI runs as:
1. ~~Health check timeout~~ (wrong — emulator boots in 36s)
2. ~~WaitFor behavior~~ (wrong — WaitOnResourceUnavailable didn't help)
3. ~~Certificate trust~~ (wrong — error is frame mismatch, not untrusted cert)

## Root Cause

The Cosmos DB vnext-preview emulator (`mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview`) serves its gateway on **port 8081 using HTTP by default**. Aspire's `RunAsPreviewEmulator` generates a connection string with `https://` for the emulator endpoint. The .NET Cosmos SDK attempts a TLS handshake against a plain HTTP endpoint, causing a frame mismatch crash.

In Aspire 13.1.2, the older Cosmos emulator image served HTTPS by default on port 8081, so no protocol mismatch occurred.

### Evidence

- CI Docker diagnostics showed the emulator was fully healthy (`System is now fully ready to accept requests`) within 36 seconds
- The Cosmos SDK error at `GatewayAccountReader.InitializeReaderAsync()` showed TLS frame parsing failure — classic HTTPS→HTTP mismatch
- The emulator's SSL config showed `ssl_cert_file` and `ssl_key_file` paths, confirming the emulator CAN serve HTTPS but wasn't configured to

## Decision

Add `PROTOCOL=https` environment variable to all `RunAsPreviewEmulator` configurations:

```csharp
.RunAsPreviewEmulator(emulator =>
{
    emulator.WithEnvironment("PROTOCOL", "https");
    emulator.WithLifetime(ContainerLifetime.Persistent);
    emulator.WithDataVolume();
});
```

This tells the vnext-preview emulator to serve HTTPS on its gateway port, matching Aspire's generated connection string.

## Alternatives Considered

1. **Use HTTP connection string**: Would require Cosmos SDK client configuration changes and might not be supported by all SDK features.
2. **Downgrade to Aspire 13.1.2**: Regression — loses all 13.2.1 improvements (Aspire CLI, dynamic ports, health checks).
3. **Bypass SSL validation in SDK**: Insecure, adds complexity, masks real SSL issues.

## Consequences

- All three AppHosts (HelloAgents, PlayersOnLevel0, DarkUxChallenge) updated
- Test fixtures retain `WaitBehavior.WaitOnResourceUnavailable` + 5-min timeout as defense-in-depth
- Local development and CI both benefit from the fix
- No impact on production (production uses real Azure Cosmos DB with proper TLS)

## Lessons Learned

1. **Read the full error chain**: The initial `SSL connection could not be established` suggested certificate trust, but the inner exception (`Cannot determine the frame size`) pointed to protocol mismatch — a completely different problem.
2. **Docker diagnostics are essential**: Without container logs showing the emulator was healthy, we would have continued chasing timeout theories.
3. **Never redirect to /dev/null**: The diagnostic data that revealed the real cause was only available because we added explicit Docker log collection to CI.
