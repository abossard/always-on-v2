using 'main.bicep'

// ── Stamp profiles ────────────────────────────────────────────────────────────
var normalStamp = {
  aksNodeVmSize: 'Standard_D4s_v5'     // 4 vCPU / 16 GB
  aksSystemNodeCount: 3
  aksAvailabilityZones: ['1', '2', '3']
  aksTier: 'Standard'
  aksIngressType: 'External'           // public LB — reachable from Standard Front Door
}

// ── Environment configurations ────────────────────────────────────────────────
var dev = {
  acrSku: 'Basic'
  frontDoorSku: 'Standard_AzureFrontDoor'
  cosmosAutoscaleMaxThroughput: 10000
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

// ── Active environment ────────────────────────────────────────────────────────
var env = dev  // ← switch to prod for production deployments

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param domainName = 'alwayson.actor'
param acrSku = env.acrSku
param frontDoorSku = env.frontDoorSku
param cosmosAutoscaleMaxThroughput = env.cosmosAutoscaleMaxThroughput
param regions = env.regions
