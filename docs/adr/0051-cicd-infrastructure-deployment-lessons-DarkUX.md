# ADR-0051: CI/CD and Infrastructure Deployment Lessons

## Status

Accepted

## Context

While adding the DarkUxChallenge application to the always-on-v2 platform — mirroring PlayersOnLevel0's architecture — we encountered several CI/CD and infrastructure deployment failures. These issues stem from copy-paste patterns that didn't account for per-app configuration differences, environment-specific behaviour in GitHub Actions, and Azure Resource Manager deployment caching.

This ADR distills the lessons learned into actionable guidelines for adding future applications.

## Decision

### 1. Port Configuration — Never Hardcode, Always Derive

**Problem:** The DarkUX CI/CD workflow copied Level0's `wait-on http://localhost:5036/health` but DarkUX's API runs on port 5199 (per its `launchSettings.json`). The E2E smoke test also hardcoded `localhost:5000` as a fallback.

**Rule:** Every app's API port comes from `Properties/launchSettings.json`. When creating a new CI workflow:
- Check the app's `launchSettings.json` for the actual port
- Use that port in `wait-on` commands
- Never use another app's port as a default/fallback

### 2. E2E Tests — Use Playwright's `baseURL`, Not Direct API Ports

**Problem:** The smoke test tried to hit the API directly (`localhost:5000`), which isn't accessible in CI when running through Aspire's AppHost.

**Rule:** In Playwright E2E tests, always use `baseURL` (the SPA's URL) for API calls. The Vite dev server proxies `/api/*` to the API. This works identically in local dev and CI.

```typescript
// ❌ Bad — hardcoded port, breaks in CI
const response = await request.get('http://localhost:5000/health');

// ✅ Good — uses SPA proxy, works everywhere
const response = await request.get(`${baseURL}/api/users/...`);
```

### 3. Test Coverage Steps — Always `continue-on-error`

**Problem:** The `irongut/CodeCoverageSummary` action failed because `coverage.cobertura.xml` wasn't generated (test runner configuration issue), which failed the entire test job and blocked the Docker push.

**Rule:** Coverage reporting and test result publishing steps should always use:
```yaml
continue-on-error: true
```
These are informational steps — they should never block deployment.

### 4. Playwright Report Paths — Match Config to Workflow

**Problem:** The workflow referenced `results.json` at the E2E root, but Playwright was configured to output to `test-results/results.json`.

**Rule:** Check `playwright.config.ts` for the `outputFile` path in the JSON reporter configuration. The workflow's `report-file` must match exactly.

### 5. Test Filters — Don't Skip Cosmos in CI

**Problem:** The initial workflow used `--filter "Category!~cosmos"` to skip Cosmos tests, but Docker is available in GitHub Actions runners, so the Aspire Cosmos emulator works fine.

**Rule:** Run the full test suite in CI (including Cosmos via Docker emulator). Only skip tests when the infrastructure genuinely isn't available. TUnit uses `--treenode-filter`, not `--filter`.

### 6. Bicep Subscription Deployments — Name Changes Force Redeployment

**Problem:** A subscription-scoped module named `deploy-healthmodel-rbac` was cached by ARM at `eastus2`. Attempting to redeploy at `swedencentral` failed with `InvalidDeploymentLocation`.

**Rule:** ARM caches subscription-scoped deployments by name + location. To force redeployment at a new location:
- Change the module's `name:` property in Bicep
- Use concise names without "deploy-" prefix (the module block is already a deployment)

```bicep
// ❌ Stuck at wrong location
module rbac 'rbac.bicep' = { name: 'deploy-healthmodel-rbac' ... }

// ✅ Fresh deployment with new name
module rbac 'rbac.bicep' = { name: 'healthmodel-rbac' ... }
```

## Consequences

- Future app additions should follow this ADR as a checklist before merging CI/CD workflows
- The Level0 workflow should be updated to apply fixes #3 and #4 for consistency
- These patterns apply to any new app added to the platform (not just DarkUxChallenge)

## References

- Commits: `2fc6947` (CI fixes), `f0d90ce` (smoke test fix), `78091d4` (healthmodel rename)
- GitHub Actions run: https://github.com/abossard/always-on-v2/actions/runs/23200303229
- ADR-0035 (hexagonal architecture), ADR-0039 (matrix testing)
