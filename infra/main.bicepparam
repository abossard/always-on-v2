using 'main.bicep'

// ── Stamp profiles ────────────────────────────────────────────────────────────
var normalStamp = {
  aksNodeVmSize: 'Standard_D4s_v5'     // 4 vCPU / 16 GB
  aksSystemNodeCount: 3
  aksAvailabilityZones: ['1', '2', '3']
  aksTier: 'Standard'
  aksIngressType: 'External'           // public LB — reachable from Standard Front Door
}

var budgetStamp = {
  aksNodeVmSize: 'Standard_D2s_v5'     // 2 vCPU / 8 GB — system pool only (kube-system, Istio, Flux)
  aksSystemNodeCount: 1                // single system node; Karpenter provisions spot instances for app workloads
  aksAvailabilityZones: []             // no AZs — budget tradeoff
  aksTier: 'Free'                      // no SLA — fine for dev/demo
  aksIngressType: 'External'
}

// ── Environment configurations ────────────────────────────────────────────────
var dev = {
  acrSku: 'Basic'
  frontDoorSku: 'Standard_AzureFrontDoor'
  cosmosAutoscaleMaxThroughput: 10000
  cosmosMode: 'Provisioned'
  eventHubsSku: 'Premium'
  enableLoadTesting: true
  logRetentionDays: 90
  regions: [
    {
      key: 'swedencentral'
      location: 'swedencentral'
      stampDefaults: normalStamp
      stamps: [
        { key: '001' }
      ]
    }
    {
      key: 'centralus'
      location: 'centralus'
      stampDefaults: normalStamp
      stamps: [
        { key: '001' }
      ]
    }
    // {
    //   key: 'southeastasia'
    //   location: 'southeastasia'
    //   stampDefaults: normalStamp
    //   stamps: [
    //     { key: '001' }
    //   ]
    // }
  ]
}

var budget = {
  acrSku: 'Basic'
  frontDoorSku: 'Standard_AzureFrontDoor'
  cosmosAutoscaleMaxThroughput: 1000   // ignored when serverless, but required by param @minValue
  cosmosMode: 'Serverless'             // pay-per-request — no provisioned RU/s
  eventHubsSku: 'Standard'             // no geo-replication, lower cost
  enableLoadTesting: false             // saves ~$869/mo
  logRetentionDays: 30                 // minimum retention
  regions: [
    {
      key: 'swedencentral'
      location: 'swedencentral'
      stampDefaults: budgetStamp
      stamps: [
        { key: '001' }
      ]
    }
  ]
}

// ── Active environment ────────────────────────────────────────────────────────
var env = dev  // ← switch to budget for low-cost deployments

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param domainName = 'alwayson.actor'
param acrSku = env.acrSku
param frontDoorSku = env.frontDoorSku
param cosmosAutoscaleMaxThroughput = env.cosmosAutoscaleMaxThroughput
param cosmosMode = env.cosmosMode
param eventHubsSku = env.eventHubsSku
param enableLoadTesting = env.enableLoadTesting
param logRetentionDays = env.logRetentionDays
param regions = env.regions
