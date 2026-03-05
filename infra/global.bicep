// ============================================================================
// Global Resources — deployed into the global resource group
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for global resources.')
param location string

@description('ACR SKU.')
param acrSku string

@description('Cosmos DB autoscale max throughput (RU/s).')
param cosmosAutoscaleMaxThroughput int

@description('Region configurations.')
param regions object

// ============================================================================
// Azure Container Registry
// ============================================================================

var acrName = replace('acr${baseName}', '-', '')

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: acrName
  location: location
  sku: { name: acrSku }
  identity: { type: 'SystemAssigned' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    dataEndpointEnabled: true
  }
}

resource acrReplications 'Microsoft.ContainerRegistry/registries/replications@2025-11-01' = [
  for region in items(regions): if (region.value.location != location) {
    parent: acr
    name: region.value.location
    location: region.value.location
    properties: {}
  }
]

// ============================================================================
// Azure Cosmos DB (Provisioned Autoscale, Multi-Region Write)
// ============================================================================

var cosmosName = 'cosmos-${baseName}'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  identity: { type: 'SystemAssigned' }
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: true
    enableMultipleWriteLocations: true
    disableLocalAuth: true
    locations: [
      for (region, i) in items(regions): {
        locationName: region.value.location
        failoverPriority: i
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
  }
}

// Autoscale throughput at the database level (closest to account-level autoscale)
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: 'app-db'
  properties: {
    resource: {
      id: 'app-db'
    }
    options: {
      autoscaleSettings: {
        maxThroughput: cosmosAutoscaleMaxThroughput
      }
    }
  }
}

// ============================================================================
// Azure Front Door (Standard)
// ============================================================================

var fdName = 'fd-${baseName}'

resource frontDoor 'Microsoft.Cdn/profiles@2025-04-15' = {
  name: fdName
  location: 'global'
  sku: { name: 'Standard_AzureFrontDoor' }
  identity: { type: 'SystemAssigned' }
  properties: {
    originResponseTimeoutSeconds: 60
  }
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-04-15' = {
  parent: frontDoor
  name: 'ep-${baseName}'
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource fdOriginGroup 'Microsoft.Cdn/profiles/originGroups@2025-04-15' = {
  parent: frontDoor
  name: 'og-default'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/healthz'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

// Front Door origins are added post-deployment once AKS ingress endpoints are available.
// Use: az afd origin create --profile-name ${fdName} --origin-group-name og-default ...
resource fdRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-04-15' = {
  parent: fdEndpoint
  name: 'rt-default'
  properties: {
    originGroup: {
      id: fdOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
  }
}

// ============================================================================
// Azure Kubernetes Fleet Manager (Hubless — Minimal Cost)
// ============================================================================

var fleetName = 'fleet-${baseName}'

resource fleet 'Microsoft.ContainerService/fleets@2025-03-01' = {
  name: fleetName
  location: location
  properties: {}
}

// ============================================================================
// Azure Load Testing
// ============================================================================

resource loadTest 'Microsoft.LoadTestService/loadTests@2024-12-01-preview' = {
  name: 'lt-${baseName}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {}
}

// ============================================================================
// Outputs
// ============================================================================

output acrId string = acr.id
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output cosmosId string = cosmos.id
output cosmosName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output fleetId string = fleet.id
output fleetName string = fleet.name
output frontDoorId string = frontDoor.id
output fdEndpointHostName string = fdEndpoint.properties.hostName
output loadTestId string = loadTest.id
