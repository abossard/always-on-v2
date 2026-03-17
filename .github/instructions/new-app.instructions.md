---
applyTo: "**"
---

# New Application Onboarding Checklist

When the user asks to create, add, or deploy a new application to the always-on-v2 platform, follow this COMPLETE checklist. Every step is required — missing any step causes deployment failures.

## Reference: Copy from an existing working app (e.g., `level0` or `darkux`)

## 1. Application Code (src/{AppName}/)

- [ ] `.slnx` solution file with Api, AppHost, ServiceDefaults, Tests projects
- [ ] `Directory.Packages.props` with centralized package versions
- [ ] `{AppName}.Api/` — Minimal API with Domain.cs, Endpoints.cs, Storage.cs, Config.cs, Program.cs
- [ ] `{AppName}.Api/Properties/launchSettings.json` — **UNIQUE PORT** (check existing apps to avoid conflicts: level0=5036, darkux=5199)
- [ ] `{AppName}.Api/appsettings.json` — with Storage and CosmosDb sections
- [ ] `{AppName}.Api/Dockerfile` — Multi-stage AOT build
- [ ] `{AppName}.Api/TrimmerRoots.xml` — Cosmos SDK trimmer roots
- [ ] `{AppName}.ServiceDefaults/` — OpenTelemetry, health checks, Scalar
- [ ] `{AppName}.AppHost/` — Aspire orchestrator with Cosmos + API + Web + E2E
- [ ] `{AppName}.AppHost/Properties/launchSettings.json` — **UNIQUE DASHBOARD PORT** (level0=17178, darkux=17179)
- [ ] `{AppName}.AppHost/ResourceNames.cs` — Central resource name constants
- [ ] `{AppName}.Tests/` — TUnit tests with Fixtures.cs + TestMatrix.cs
- [ ] `{AppName}.SPA.Web/` — React + Vite + TypeScript SPA
- [ ] `{AppName}.SPA.Web/Dockerfile` — Static build + serve
- [ ] `{AppName}.E2E/` — Playwright E2E tests

## 2. Bicep Infrastructure (infra/)

All files below are REQUIRED for the app to deploy:

- [ ] `infra/apps/{appname}/infra.bicep` — Managed identity, Cosmos DB database + container, RBAC roles
- [ ] `infra/apps/{appname}/federated-creds.bicep` — Workload identity federation for AKS pods
- [ ] `infra/main.bicep` — **ALL of the following changes:**
  - [ ] Add entry to `apps` parameter array: `{ name: '{appname}', subdomain: '{subdomain}', namespace: '{appname}' }`
  - [ ] Add module call for `apps/{appname}/infra.bicep`
  - [ ] Add entry to `appFluxVars` array with identity + cosmos outputs
  - [ ] Add module call for `apps/{appname}/federated-creds.bicep` (per stamp)
  - [ ] Add module call for `app-routing.bicep` with app's subdomain
- [ ] **`infra/stamp.bicep`** — **CRITICAL: Add `{APPNAME}FluxVars` variable block AND include it in the `fluxSubstitute` union.** Missing this causes the K8s manifests to have unsubstituted `${APPNAME_*}` variables, breaking DNS and deployment entirely.

### stamp.bicep Flux vars pattern:
```bicep
var {appname}FluxVars = length(appFluxVars) > {INDEX} && appFluxVars[{INDEX}].name == '{appname}' ? {
  {APPNAME}_NAMESPACE: appFluxVars[{INDEX}].namespace
  {APPNAME}_SA_NAME: appFluxVars[{INDEX}].name
  {APPNAME}_IDENTITY_CLIENT_ID: appFluxVars[{INDEX}].identityClientId
  {APPNAME}_IDENTITY_ID: appFluxVars[{INDEX}].identityId
  {APPNAME}_COSMOS_DATABASE: appFluxVars[{INDEX}].cosmosDatabase
  {APPNAME}_COSMOS_CONTAINER: appFluxVars[{INDEX}].cosmosContainer
  {APPNAME}_DNS_LABEL: '{appname}-${stampName}'
  {APPNAME}_GATEWAY_HOSTNAME: '{appname}-${stampName}.${dnsZoneName}'
} : {}

// MUST update this line to include the new vars:
var fluxSubstitute = union(sharedFluxVars, level0FluxVars, ..., {appname}FluxVars)
```

## 3. Kubernetes Manifests (clusters/)

- [ ] `clusters/base/apps/{appname}/deployment.yaml` — Namespace, ServiceAccount, API + SPA Deployments, Services
- [ ] `clusters/base/apps/{appname}/routes.yaml` — Gateway API HTTPRoutes (API + SPA)
- [ ] `clusters/base/apps/{appname}/kustomization.yaml` — Kustomize config with gateway component
- [ ] `clusters/base/apps/{appname}/image-automation.yaml` — Flux image automation
- [ ] `clusters/base/apps/kustomization.yaml` — **Add `./{appname}/` to resources list**

### K8s manifest variable reference (substituted by Flux from stamp.bicep):
- `${APPNAME_NAMESPACE}`, `${APPNAME_SA_NAME}`, `${APPNAME_IDENTITY_CLIENT_ID}`
- `${APPNAME_DNS_LABEL}`, `${APPNAME_GATEWAY_HOSTNAME}`
- `${APPNAME_COSMOS_DATABASE}`, `${APPNAME_COSMOS_CONTAINER}`
- `${ACR_LOGIN_SERVER}`, `${COSMOS_ENDPOINT}`, `${APPLICATIONINSIGHTS_CONNECTION_STRING}`

## 4. GitHub Actions CI/CD

- [ ] `.github/workflows/{appname}-cicd.yml` with:
  - Trigger on `src/{AppName}/**` paths
  - `dotnet test` job (uses Docker for Cosmos emulator)
  - Playwright E2E job via Aspire AppHost
  - `app-build-push.yml` reusable workflow call (main branch only)
- [ ] **Port in `wait-on` must match API's launchSettings.json port**
- [ ] **Playwright report path must match `playwright.config.ts` outputFile**
- [ ] Coverage steps must use `continue-on-error: true`
- [ ] E2E smoke tests must use Playwright's `baseURL` proxy, NOT hardcoded API ports

## 5. Skaffold (local dev)

- [ ] `skaffold.yaml` — Add artifacts for API + SPA images

## 6. Verification After Deployment

```bash
# Infrastructure
azd provision

# Verify DNS
nslookup {subdomain}.alwayson.actor
nslookup {appname}-swedencentral-001.swedencentral.alwayson.actor

# Verify K8s
kubectl -n {appname} get pods
kubectl -n {appname} get svc -o jsonpath='{.items[*].metadata.annotations}'

# Verify app
curl https://{subdomain}.alwayson.actor/health
```

## Common Gotchas (from ADR-0049)

1. **Forgot stamp.bicep Flux vars** → K8s manifests have literal `${APPNAME_*}` → DNS never created → 503
2. **Wrong port in CI wait-on** → E2E times out → CI fails
3. **Hardcoded API port in E2E tests** → Use `baseURL` proxy instead
4. **ARM deployment name cache** → Rename module to force redeployment at new location
5. **Missing `continue-on-error` on coverage** → Coverage failure blocks Docker push
