# DarkUxChallenge

This project includes two route scopes for the SPA:

- Baseline mode at `/:userId`
- Challenge mode at `/challenge/:userId`

Challenge mode is sandbox-only. It intentionally adds extra friction for automation practice without corrupting labels, roles, or accessible names.

Current challenge-mode mechanics:

- Focus-trapped route briefing dialog
- Delayed enablement before route entry
- Explicit acknowledgement checkbox
- Short-lived sync curtain after navigation
- Two-step level entry from the hub

Do not copy challenge-mode mechanics into production applications. They exist here only for educational testing of hostile-but-truthful flows.