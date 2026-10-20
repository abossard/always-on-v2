# AlwaysOn v2 - Mission-Critical Apps on Azure (azd sample)

A lightweight **Azure Developer CLI (`azd`) sample** that deploys a globally distributed,
mission-critical platform on Azure — AKS stamps, Cosmos DB, Front Door, Orleans apps, and
full observability — with a single command.

```bash
azd auth login
azd up
```

The current azd sample configures **two stamps**, one in Sweden Central and one in East US 2.
Change the topology in the `regions` array (see [Deploy](#deploy-with-azure-developer-cli-azd)).

- 📦 **What's inside** → [FEATURES.md](FEATURES.md) — every app, tool, and platform feature, with links and sources.
- 🏭 **CI/CD, Flux & production topology** → [ci-cd/](ci-cd/README.md).
- 🧱 **Architecture decisions** → [docs/adr/](docs/adr/README.md).

| Layer | Technology |
|---|---|
| Compute | AKS (multi-stamp, Karpenter autoscale) |
| Framework | .NET 10, Orleans, Aspire |
| Database | Azure Cosmos DB |
| Ingress | Azure Front Door + Istio Gateway API |
| AI | Azure OpenAI |
| Observability | App Insights + OpenTelemetry + Prometheus |
| IaC | Bicep via `azd` |

Full catalog and sources: **[FEATURES.md](FEATURES.md)**.

---

## Prerequisites

- [.NET SDK 10.0.402](https://dotnet.microsoft.com/download), pinned in `global.json`
- [Aspire CLI 13.6.1](https://aspire.dev/get-started/install-cli/): `dotnet tool install -g Aspire.Cli --version 13.6.1`. No Aspire workload is required.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Podman (local dev only — `azd` builds images remotely)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Node.js 26 for the React SPAs and Playwright E2E. CI and frontend build images use 26.12.0.

**Also required by the `azd` deploy hooks** (the `postdeploy` step renders K8s manifests locally):

- [kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/)
- `envsubst` (ships with `gettext`; `brew install gettext` on macOS)
- [jq](https://jqlang.github.io/jq/)

---

## Getting started

### Run an app locally

```bash
# Example: HelloAgents
cd src/HelloAgents
cd HelloAgents.Web && npm ci && cd ..
aspire run --apphost HelloAgents.AppHost
```

See each app folder (linked from [FEATURES.md](FEATURES.md)) for app-specific notes.

### Local verification

**Build and .NET tests**

```bash
dotnet build src/src.slnx
dotnet test --solution src/src.slnx --no-build \
  --max-parallel-test-modules 1 --zero-tests-policy strict
```

**Playwright**

```bash
(
  set -e
  for app in DarkUxChallenge HelloOrleons GraphOrleons HelloAgents; do
    (
      cd "src/$app"
      npm ci --prefix "$app.E2E"
      (cd "$app.E2E" && npx playwright install chromium)
      trap 'aspire stop --non-interactive --nologo' EXIT
      CI=true OPENAI_ENDPOINT= aspire start --apphost "$app.AppHost/$app.AppHost.csproj" \
        --non-interactive -- --AZURE_OPENAI_ENDPOINT= --CosmosDb:UseEphemeralEmulator=true
      aspire wait api --timeout 240
      if [ "$app" != HelloOrleons ]; then
        aspire wait web --timeout 240
      fi
      aspire resource e2e start
      aspire wait e2e --status down --timeout 300
      aspire describe e2e --format json |
        jq -e '.resources | length == 1 and .[0].exitCode == 0'
    )
  done
)
```

**Python**

```bash
(
  set -e
  cd src/health-models-tui
  uv sync --locked --python 3.11
  uv run --locked python -m pytest azext_health_models_tui/tests/
)
```

**Docker images**

```bash
(
  set -e
  for app in DarkUxChallenge HelloOrleons GraphOrleons HelloAgents; do
    (cd "src/$app" && docker buildx bake --allow=fs.read=../.. \
      --set '*.cache-from=' --set '*.cache-to=')
  done
)
```

### Deploy to Azure

```bash
azd auth login
azd env new my-dev --location swedencentral --subscription <subscription-id>
azd up
```

After provisioning and application rollouts succeed, each app is available at its Front Door
HTTPS endpoint printed by the deploy hook.

> **⚠️ Don't name the env `alwayson`** — it collides with the production `baseName`. The
> `preprovision` hook blocks it. Use any other name (`my-dev`, `test`, `demo`).

---

## Deploy with Azure Developer CLI (`azd`)

`azd up` deploys the entire platform from your machine — **no hosted Git repo and no Flux
required**. It runs:

```
azd up
├── azd provision      Deploys all Azure infra (AKS, ACR, Front Door, Cosmos DB, AI, ...)
│   └── postprovision  Enables Gateway API, gets cluster credentials, extracts deploy vars
└── azd deploy
    ├── predeploy      Builds images remotely via `az acr build` (no Docker Desktop needed)
    └── postdeploy     `kustomize build | envsubst | kubectl apply`, waits for rollout,
                       verifies health, prints Front Door endpoints
```

For the existing `alwaysonn` environment, every rollout and recovery starts with
`azd up --environment alwaysonn`. Do not resume with individual phases, services or
standalone hooks. A failed phase leaves the run failed, even if some resources updated.
Review the full subscription what-if and preservation baseline before retrying.

Provisioning outputs come from that lifecycle's named environment, not the latest
successful deployment. Health-model generation is required. All seven image contexts
and builds must succeed before the new source hash/tag is saved; changed source or
missing/mismatched image attribution stops rollout. Postdeploy requires exactly seven
workload image substitutions per stamp and publishes only the HelloAgents dashboard
to the explicit `aiObservability` target. Publication failure fails the full run.

### Stamps & regions

The topology is **data** in [`infra/main.parameters.json`](infra/main.parameters.json) (the
`regions` array). Stamps and regions are added by editing that array — the hooks and Bicep
iterate over whatever you declare, so a single stamp "just works".

**Current azd sample: 2 regions, 1 stamp per region.** Sweden Central uses `Standard_D2s_v5`;
East US 2 uses `Standard_D2s_v6`. The spot NodePool admits D/E generations 4, 5, and 6.
Verify subscription-specific VM availability and quota before choosing another region.

For a lower-cost single-region deployment, reduce `regions` to one entry:

```jsonc
"regions": {
  "value": [
    {
      "key": "swedencentral",
      "location": "swedencentral",
      "stampDefaults": { "aksNodeVmSize": "Standard_D2s_v5", "aksSystemNodeCount": 1,
        "aksAvailabilityZones": [], "aksTier": "Free", "aksIngressType": "External", "aksUseSpot": true },
      "stamps": [{ "key": "001" }]
    }
  ]
}
```

**Two stamps in the same region** — add a second entry to `stamps`:

```jsonc
"stamps": [{ "key": "001" }, { "key": "002" }]
```

**Two stamps across two regions** — add a second region object:

```jsonc
"regions": {
  "value": [
    { "key": "swedencentral", "location": "swedencentral",
      "stampDefaults": { "...": "as above" }, "stamps": [{ "key": "001" }] },
    { "key": "germanywestcentral", "location": "germanywestcentral",
      "stampDefaults": { "...": "as above" }, "stamps": [{ "key": "001" }] }
  ]
}
```

Run `azd up` again after editing. For provisioned/multi-write Cosmos, Premium Front Door,
and the GitHub Actions/Flux production path, see [ci-cd/](ci-cd/README.md).

### Optional toggles

Set these in [`infra/main.parameters.json`](infra/main.parameters.json):

| Parameter | Default | Effect |
|---|---|---|
| `enableFlux` | `false` | Flux GitOps on AKS. `azd` deploys via the `postdeploy` hook when off. See [ci-cd/](ci-cd/README.md). |
| `enableCustomDomain` | `false` | Custom-domain routing (DNS zones, CNAMEs). Off uses Front Door default endpoints. |
| `enableHelloOrleonsApiDocs` | `true` in the azd sample | Opts HelloOrleons into OpenAPI/Scalar outside Development. The Bicep default is `false`, so production profiles remain unchanged unless explicitly enabled. |
| `gpt41MiniCapacity` | `100` in the azd sample | Allocates existing `GlobalStandard` quota to `gpt-41-mini` for concurrent agent workflows. The Bicep default remains `10`; other model allocations and the pay-per-token SKU are unchanged. |
| `enablePrivateEndpoints` | `true` | Per-stamp VNet + private endpoints, public access disabled. |
| `cosmosMode` | `Serverless` | `Provisioned` enables autoscale + multi-region write. |
| `frontDoorSku` | `Standard_AzureFrontDoor` | `Premium_AzureFrontDoor` for WAF + Private Link to internal LB. |

With private networking enabled, Bicep owns the subnet NSGs and their associations.
External gateways allow `AzureFrontDoor.Backend` traffic on TCP 80, plus 443 in custom-domain
mode. Internal gateways retain private-network ingress. Node-NIC allow rules do not override
a subnet NSG's inbound deny.

### How it works (Flux-free, the default)

With `enableFlux = false`, the `postdeploy` hook replaces Flux's reconciliation loop with a
local equivalent, using the **same** manifests in [`clusters/`](clusters/) unchanged:

1. `kustomize build` renders `clusters/<region>/apps` (what Flux would render).
2. `envsubst` substitutes `${VAR}` patterns from Bicep outputs (same as Flux `postBuild.substitute`).
3. `kubectl apply --server-side` applies to AKS (same as Flux reconciliation).

The hook omits Flux-only resources when Flux is disabled and certificate-only resources when
custom domains are disabled. Render, apply, missing-workload, and rollout errors fail deployment
rather than being treated as successful delivery.

### Tear down

```bash
azd down --force --purge
```

---

## Repository layout

| Path | What |
|---|---|
| [`FEATURES.md`](FEATURES.md) | Applications, tools, and platform features — with sources |
| [`src/`](src/) | .NET 10 / Orleans apps + shared libraries + `az health-models-tui` CLI |
| [`infra/`](infra/) | Bicep IaC (`main.bicep` entry point) + `main.parameters.json` |
| [`clusters/`](clusters/) | Kustomize/Flux manifests (also used by the `azd` postdeploy hook) |
| [`hooks/`](hooks/) | `azd` lifecycle hooks (pre/post provision & deploy) |
| [`ci-cd/`](ci-cd/README.md) | GitHub Actions, Flux/GitOps, deploy keys, production profiles |
| [`scripts/`](scripts/) | Health model + Grafana dashboard generators |
| [`docs/adr/`](docs/adr/README.md) | Architecture Decision Records |

---

## References

- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/)
- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/)
- [Mission-Critical Architecture](https://learn.microsoft.com/azure/architecture/framework/mission-critical/mission-critical-overview)
- [Orleans Documentation](https://learn.microsoft.com/dotnet/orleans/)
- [AKS Best Practices](https://learn.microsoft.com/azure/aks/best-practices)
- [Cosmos DB Best Practices](https://learn.microsoft.com/azure/cosmos-db/best-practice-guide)
