# AlwaysOn v2 — Mission-Critical Apps on Azure (azd sample)

A lightweight **Azure Developer CLI (`azd`) sample** that deploys a globally distributed,
mission-critical platform on Azure — AKS stamps, Cosmos DB, Front Door, Orleans apps, and
full observability — with a single command.

```bash
azd auth login
azd up
```

That deploys a **single stamp** in one region. Scaling to two stamps or two regions is one
small edit (see [Deploy](#deploy-with-azure-developer-cli-azd)).

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

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Aspire CLI](https://learn.microsoft.com/dotnet/aspire/fundamentals/cli): `dotnet tool install -g Aspire.Cli`
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Podman (local dev only — `azd` builds images remotely)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Node.js (LTS) — for the React SPAs and Playwright E2E

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

### Deploy to Azure

```bash
azd auth login
azd env new my-dev --location swedencentral --subscription <subscription-id>
azd up
```

After ~15 minutes every app is live at its Front Door HTTPS endpoint (printed at the end).

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

### Stamps & regions — start with one

The topology is **data** in [`infra/main.parameters.json`](infra/main.parameters.json) (the
`regions` array). Stamps and regions are added by editing that array — the hooks and Bicep
iterate over whatever you declare, so a single stamp "just works".

**Default (shipped): 1 region, 1 stamp.** This is what most people want — lowest cost
(Serverless Cosmos, Free AKS tier, spot workers), one region.

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
| `enablePrivateEndpoints` | `true` | Per-stamp VNet + private endpoints, public access disabled. |
| `cosmosMode` | `Serverless` | `Provisioned` enables autoscale + multi-region write. |
| `frontDoorSku` | `Standard_AzureFrontDoor` | `Premium_AzureFrontDoor` for WAF + Private Link to internal LB. |

### How it works (Flux-free, the default)

With `enableFlux = false`, the `postdeploy` hook replaces Flux's reconciliation loop with a
local equivalent, using the **same** manifests in [`clusters/`](clusters/) unchanged:

1. `kustomize build` renders `clusters/<region>/apps` (what Flux would render).
2. `envsubst` substitutes `${VAR}` patterns from Bicep outputs (same as Flux `postBuild.substitute`).
3. `kubectl apply --server-side` applies to AKS (same as Flux reconciliation).

### Tear down

```bash
azd down --force --purge
```

---

## Repository layout

| Path | What |
|---|---|
| [`FEATURES.md`](FEATURES.md) | Applications, tools, and platform features — with sources |
| [`src/`](src/) | .NET 10 / Orleans apps + shared libraries + `az healthmodel` CLI |
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
