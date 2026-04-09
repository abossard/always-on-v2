using 'main.bicep'

// ── Stamp profiles ────────────────────────────────────────────────────────────
var budgetStamp = {
  aksNodeVmSize: 'Standard_B2ms'       // 2 vCPU / 8 GB
  aksSystemNodeCount: 1
  aksAvailabilityZones: []
  aksTier: 'Free'
  aksIngressType: 'External'           // public LB — reachable from Standard Front Door
}

var productionStamp = {
  aksNodeVmSize: 'Standard_D4s_v5'     // 4 vCPU / 16 GB
  aksSystemNodeCount: 3
  aksAvailabilityZones: ['1', '2', '3']
  aksTier: 'Standard'
  aksIngressType: 'Internal'           // private LB — Premium Front Door via Private Link
}

// ── Environment configurations ────────────────────────────────────────────────
var dev = {
  acrSku: 'Basic'                      // no geo-replication needed in dev
  frontDoorSku: 'Standard_AzureFrontDoor'
  cosmosAutoscaleMaxThroughput: 10000   // 1k-10k autoscale range
  regions: [
    {
      key: 'swedencentral'
      location: 'swedencentral'
      stampDefaults: budgetStamp
      stamps: [
        { key: '002' }
      ]
    }
  ]
}

var prod = {
  acrSku: 'Premium'                    // geo-replication across regions
  frontDoorSku: 'Premium_AzureFrontDoor'
  cosmosAutoscaleMaxThroughput: 4000
  regions: [
    {
      key: 'swedencentral'
      location: 'swedencentral'
      stampDefaults: productionStamp
      stamps: [
        { key: '001' }
        { key: '002' }
      ]
    }
    {
      key: 'germanywestcentral'
      location: 'germanywestcentral'
      stampDefaults: productionStamp
      stamps: [
        { key: '001' }
      ]
    }
  ]
}

// ── Active environment ────────────────────────────────────────────────────────
var env = dev  // ← switch to prod for production deployments

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param domainName = 'alwayson.actor'
param acrSku = env.acrSku
param frontDoorSku = env.frontDoorSku
param cosmosAutoscaleMaxThroughput = env.cosmosAutoscaleMaxThroughput
param regions = env.regions
