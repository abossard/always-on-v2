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

@description('Domain name for Azure DNS zone.')
param domainName string

@description('Region configurations array.')
param regions array

@description('Front Door SKU. Premium for prod (WAF, Private Link to internal LB). Standard for dev (public origins, lower cost).')
@allowed(['Premium_AzureFrontDoor', 'Standard_AzureFrontDoor'])
param frontDoorSku string = 'Premium_AzureFrontDoor'

// ============================================================================
// User-Assigned Managed Identities (one per global service)
// ============================================================================

resource acrIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-acr-${baseName}'
  location: location
}

resource cosmosIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-cosmos-${baseName}'
  location: location
}

resource fdIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-fd-${baseName}'
  location: location
}

resource loadTestIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-lt-${baseName}'
  location: location
}

resource healthModelIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-healthmodel-${baseName}'
  location: location
}

// ============================================================================
// Azure Container Registry
// ============================================================================

var salt = substring(uniqueString(subscription().id, baseName), 0, 6)
var acrName = replace('acr${baseName}${salt}', '-', '')

resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: acrName
  location: location
  sku: { name: acrSku }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrIdentity.id}': {}
    }
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    dataEndpointEnabled: acrSku == 'Premium'   // only supported on Premium SKU
  }
}

resource acrReplications 'Microsoft.ContainerRegistry/registries/replications@2025-11-01' = [
  for region in regions: if (region.location != location) {
    parent: acr
    name: region.location
    location: region.location
    properties: {}
  }
]

// ============================================================================
// Azure Cosmos DB (Provisioned Autoscale, Multi-Region Write)
// ============================================================================

var cosmosName = 'cosmos-${baseName}-${salt}'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${cosmosIdentity.id}': {}
    }
  }
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: true
    enableMultipleWriteLocations: true
    disableLocalAuth: true
    locations: [
      for (region, i) in regions: {
        locationName: region.location
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
// Azure Front Door (conditional — skipped when frontDoorSku == 'none')
// ============================================================================

var fdName = 'fd-${baseName}'

resource frontDoor 'Microsoft.Cdn/profiles@2025-04-15' = {
  name: fdName
  location: 'global'
  sku: { name: frontDoorSku }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${fdIdentity.id}': {}
    }
  }
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

// Front Door origins + routes are defined per-app in infra/apps/{name}/routing.bicep.

// Front Door custom domain for apex domain
resource fdCustomDomain 'Microsoft.Cdn/profiles/customDomains@2025-04-15' = {
  parent: frontDoor
  name: replace(domainName, '.', '-')
  properties: {
    hostName: domainName
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
    azureDnsZone: {
      id: dnsZone.id
    }
  }
}

// ============================================================================
// Azure DNS Zone
// ============================================================================

resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' = {
  name: domainName
  location: 'global'
}

// Alias A record: apex domain → Front Door endpoint
resource dnsApexAlias 'Microsoft.Network/dnsZones/A@2023-07-01-preview' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 300
    targetResource: {
      id: fdEndpoint.id
    }
  }
}

// ============================================================================
// Azure Kubernetes Fleet Manager (Hubless — Minimal Cost)
// ============================================================================

var fleetName = 'fleet-${baseName}'

resource fleet 'Microsoft.ContainerService/fleets@2025-03-01' = {
  name: fleetName
  location: location
  properties: {
    hubProfile: {
      dnsPrefix: 'fleet-${baseName}'
    }
  }
}

// ============================================================================
// Azure Load Testing
// ============================================================================

resource loadTest 'Microsoft.LoadTestService/loadTests@2024-12-01-preview' = {
  name: 'lt-${baseName}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${loadTestIdentity.id}': {}
    }
  }
  properties: {}
}

// ============================================================================
// Global Log Analytics Workspace (for Application Insights)
// ============================================================================

resource globalLogAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${baseName}-global'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
  }
}

// ============================================================================
// Application Insights (global, workspace-based)
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'ai-${baseName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: globalLogAnalytics.id
    DisableLocalAuth: true
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
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
output dnsZoneId string = dnsZone.id
output dnsZoneName string = dnsZone.name
output dnsNameServers array = dnsZone.properties.nameServers
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsId string = appInsights.id
output healthModelIdentityId string = healthModelIdentity.id
output healthModelIdentityClientId string = healthModelIdentity.properties.clientId
output healthModelIdentityPrincipalId string = healthModelIdentity.properties.principalId
