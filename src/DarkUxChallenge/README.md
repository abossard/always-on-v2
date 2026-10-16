# DarkUxChallenge

Local tests use fresh, session-scoped Cosmos emulator storage. For manual verification, pass `--CosmosDb:UseEphemeralEmulator=true` after the Aspire CLI's `--` separator. Normal development keeps its existing persistent volume; this option does not reset or migrate that data. Older emulator catalogs may be incompatible with the current emulator image.

The welcome page enters a hardened session at `/:userId`; level routes are `/:userId/levels/:level`. Browser checks acknowledge each route briefing, wait for the sync curtain, and confirm hub entries.

The hardened flow is sandbox-only. It intentionally adds extra friction for automation practice without corrupting labels, roles, or accessible names.

Current hardened-flow mechanics:

- Focus-trapped route briefing dialog
- Delayed enablement before route entry
- Explicit acknowledgement checkbox
- Short-lived sync curtain after navigation
- Two-step level entry from the hub

Do not copy these mechanics into production applications. They exist here only for educational testing of hostile-but-truthful flows.