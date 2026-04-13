// ============================================================================
// Global Resources — deployed into the global resource group
// ============================================================================
@minLength(3)
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
    publicNetworkAccess: 'Enabled'
    enableAutomaticFailover: true
    enableMultipleWriteLocations: true
    disableLocalAuth: true
    locations: [
      for (region, i) in regions: {
        locationName: region.location
        failoverPriority: i
        isZoneRedundant: true
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

// Apex domain redirect: alwayson.actor → GitHub repo
resource fdApexRuleSet 'Microsoft.Cdn/profiles/ruleSets@2025-04-15' = {
  parent: frontDoor
  name: 'ApexRedirect'
}

resource fdApexRedirectRule 'Microsoft.Cdn/profiles/ruleSets/rules@2025-04-15' = {
  parent: fdApexRuleSet
  name: 'RedirectToGitHub'
  properties: {
    order: 1
    actions: [
      {
        name: 'UrlRedirect'
        parameters: {
          typeName: 'DeliveryRuleUrlRedirectActionParameters'
          redirectType: 'PermanentRedirect'
          destinationProtocol: 'Https'
          customHostname: 'github.com'
          customPath: '/abossard/always-on-v2'
        }
      }
    ]
  }
}

// Dummy origin group required by Front Door (route never reaches it — redirect fires first)
resource fdApexOriginGroup 'Microsoft.Cdn/profiles/originGroups@2025-04-15' = {
  parent: frontDoor
  name: 'og-apex-redirect'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
  }
}

resource fdApexOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2025-04-15' = {
  parent: fdApexOriginGroup
  name: 'placeholder'
  properties: {
    hostName: 'github.com'
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1
  }
}

// originGroup references fdApexOriginGroup.id but route also needs origin to exist.
// Referencing fdApexOrigin.id in a local var creates the implicit dependency.
var apexOriginGroupIdWithDep = split(fdApexOrigin.id, '/origins/')[0]

resource fdApexRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-04-15' = {
  parent: fdEndpoint
  name: 'route-apex-redirect'
  properties: {
    customDomains: [
      { id: fdCustomDomain.id }
    ]
    originGroup: { id: apexOriginGroupIdWithDep }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Disabled'
    enabledState: 'Enabled'
    ruleSets: [
      { id: fdApexRuleSet.id }
    ]
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
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
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
// Event Hubs — Premium namespace with geo-data-replication + Capture
// ============================================================================

var ehCaptureStorageName = replace('stadlseh${take(baseName, 12)}', '-', '')
var ehCaptureStorageNameSafe = length(ehCaptureStorageName) > 24
  ? substring(ehCaptureStorageName, 0, 24)
  : ehCaptureStorageName

resource ehCaptureStorage 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: ehCaptureStorageNameSafe
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_RAGZRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource ehCaptureContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  name: '${ehCaptureStorage.name}/default/graph-events-archive'
  properties: {}
}

var ehNamespaceName = 'eh-${baseName}'

var ehPrimaryLocation = {
  locationName: location
  roleType: 'Primary'
}
var ehReplicationLocations = concat([ehPrimaryLocation], map(regions, r => {
  locationName: r.location
  roleType: r.location == location ? 'Primary' : 'Secondary'
}))
// Filter to unique locations (primary is already in the array; skip duplicates from regions)
var ehReplicationLocationsDeduped = filter(ehReplicationLocations, (loc, i) =>
  indexOf(map(ehReplicationLocations, l => l.locationName), loc.locationName) == i
)

resource ehNamespace 'Microsoft.EventHub/namespaces@2025-05-01-preview' = {
  name: ehNamespaceName
  location: location
  sku: {
    name: 'Premium'
    tier: 'Premium'
    capacity: 1
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    geoDataReplication: {
      locations: ehReplicationLocationsDeduped
      maxReplicationLagDurationInSeconds: 0
    }
    disableLocalAuth: true
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource graphEventsHub 'Microsoft.EventHub/namespaces/eventhubs@2025-05-01-preview' = {
  parent: ehNamespace
  name: 'graph-events'
  properties: {
    partitionCount: 4
    messageRetentionInDays: 7
    captureDescription: {
      enabled: true
      encoding: 'Avro'
      intervalInSeconds: 300
      sizeLimitInBytes: 314572800
      skipEmptyArchives: true
      destination: {
        name: 'EventHubArchive.AzureBlockBlob'
        properties: {
          storageAccountResourceId: ehCaptureStorage.id
          blobContainer: 'graph-events-archive'
          archiveNameFormat: '{Namespace}/{EventHub}/{PartitionId}/{Year}/{Month}/{Day}/{Hour}/{Minute}/{Second}'
        }
      }
    }
  }
}

// RBAC — Storage Blob Data Contributor for Capture (EH system identity → storage)
var roles = loadJsonContent('roles.json')

resource ehCaptureStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(ehCaptureStorage.id, ehNamespace.id, roles.storageBlobDataContributor)
  scope: ehCaptureStorage
  properties: {
    principalId: ehNamespace.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.storageBlobDataContributor
    )
    principalType: 'ServicePrincipal'
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
output frontDoorId string = frontDoor.id
output fdEndpointHostName string = fdEndpoint.properties.hostName
output dnsNameServers array = dnsZone.properties.nameServers
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsId string = appInsights.id
output healthModelIdentityId string = healthModelIdentity.id
output healthModelIdentityPrincipalId string = healthModelIdentity.properties.principalId
output cosmosDatabaseName string = cosmosDatabase.name
output eventHubsNamespaceName string = ehNamespace.name
output eventHubsNamespaceId string = ehNamespace.id
output graphEventsConnectionString string = '${split(split(ehNamespace.properties.serviceBusEndpoint, '//')[1], ':')[0]};EntityPath=${graphEventsHub.name}'
