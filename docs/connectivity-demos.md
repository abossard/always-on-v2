# Connectivity health-model demos

Four isolated Azure Monitor health models are deployed in `rg-alwaysonn-global`,
subscription `6fc552c5-06b6-43d7-ac70-2f1eda1be033`, tenant
`46693104-8c42-47b7-98e3-985ed39402f6`. The model resources are hosted in UK South.

| Model | Demonstration | Verified real context |
|---|---|---|
| `hm-demo-connectivity-alwaysonn-regional` | A failed named path has Limited impact; shared routing can remain Healthy | `hm-platform-swedencentral-001` |
| `hm-demo-connectivity-alwaysonn-vwan` | Corporate and partner firewall perspectives can disagree | Front Door profile `fd-alwaysonn` |
| `hm-demo-connectivity-alwaysonn-hybrid` | Healthy ExpressRoute paths do not establish a healthy end-to-end journey | `hm-helloagents` |
| `hm-demo-connectivity-alwaysonn-dns` | Resolver availability, DNS answers and private-service journey evidence differ | Cosmos account `cosmos-alwaysonn-fiqhqx` |

Connectivity equipment and observations are explicitly **SIMULATED**. The real
resources provide non-contributing context through Suppressed impact. These
relationships do not create network connectivity or measure real traffic.
Each demo model has a system-assigned identity with Reader scoped only to its
listed context resource.

## Find the deployed models

The installed `health-models` extension exposes `az monitor health-models`:

```bash
az monitor health-models list \
  --subscription 6fc552c5-06b6-43d7-ac70-2f1eda1be033 \
  --resource-group rg-alwaysonn-global \
  --query "[?starts_with(name, 'hm-demo-connectivity-alwaysonn-')].{name:name,location:location}" \
  --output table
```

## Deployment and scene publication

The demos were created directly through Azure CLI. Their baseline, defining-fault
and recovery reports were published with
`az monitor health-models entity ingest-health-report` and read back from Azure.
No `azd` environment, hook or custom grant file is needed for this route.
The older azd scaffold and grant-bound Node runner are not the deployed route.
Production deployment hooks and production health-model definitions are unchanged.

Publication targets only declared synthetic diagnostic leaves. Parent and root
health comes from Azure's dependency evaluation, not authored parent reports.
External signal groups are service-owned; publish through the ingestion action,
not an entity PUT that attempts to author runtime health.

Report names use canonical lowercase letters, digits and hyphens. The API pattern
is `^[a-zA-Z0-9][a-zA-Z0-9-]{1,258}[a-zA-Z0-9]$`; dots are not accepted, and the
service lowercases names in readback.

Normal reports expire after 60 minutes. The deliberate DNS expiry probe lasts
three minutes. Report expiry removes evidence; it does not delete the model or
necessarily make its composite root Unknown. Re-publish the complete baseline
report set to refresh or recover a scene; reset is not resource deletion.

The publication-only replay script, exact executed commands, payloads, readback
receipts and screenshots accompany the deployment evidence. Replay checks report
identity, context, timestamps, full signal sets and actual rollups before success.

## Preserve the live layouts

The user has edited and approved the Azure layouts. Scene publication changes
runtime observations only. Do not reapply a generated graph, regenerate positions
or redeploy model/entity/relationship definitions over these edits.

The existing graphs support the scenes above. The original larger graph expansion
and any further redeployment remain deferred; they are not implied by successful
scene publication or layout approval.
