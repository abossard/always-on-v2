// ============================================================================
// Event Hubs — Premium namespace with geo-data-replication + Capture
// ============================================================================
// Reusable module: creates the Event Hubs namespace, event hub with Capture,
// and RBAC for the producing app identity.

@description('Base name for all resources.')
@minLength(3)
param baseName string

@description('Primary location for the Event Hubs namespace.')
param location string

@description('Secondary locations for geo-data-replication (array of location strings).')
param secondaryLocations array = []

@description('Capture destination storage account resource ID.')
param captureStorageAccountId string

@description('Capture destination storage account name (for RBAC).')
param captureStorageAccountName string

@description('Principal ID of the identity that needs Event Hubs Data Sender role.')
param senderPrincipalId string

@description('Synchronous replication lag (0 = sync/RPO-0, >0 = async with max lag in seconds).')
param maxReplicationLagSeconds int = 0

// ============================================================================
// Naming
// ============================================================================
var ehNamespaceName = 'eh-${baseName}'

// ============================================================================
// Event Hubs Namespace (Premium, Geo-Replicated)
// ============================================================================

var primaryLocation = {
  locationName: location
  roleType: 'Primary'
}
var replicationLocations = concat([primaryLocation], map(secondaryLocations, loc => {
  locationName: loc
  roleType: 'Secondary'
}))

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
      locations: replicationLocations
      maxReplicationLagDurationInSeconds: maxReplicationLagSeconds
    }
    disableLocalAuth: true
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// Event Hub: graph-events (with Capture to ADLS Gen2)
// ============================================================================

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
          storageAccountResourceId: captureStorageAccountId
          blobContainer: 'graph-events-archive'
          archiveNameFormat: '{Namespace}/{EventHub}/{PartitionId}/{Year}/{Month}/{Day}/{Hour}/{Minute}/{Second}'
        }
      }
    }
  }
}

// ============================================================================
// RBAC — Event Hubs Data Sender for the producing app identity
// ============================================================================

var eventHubsDataSenderRoleId = '2b629674-e913-4c01-ae53-ef4638d8f975'

resource senderRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(ehNamespace.id, senderPrincipalId, eventHubsDataSenderRoleId)
  scope: ehNamespace
  properties: {
    principalId: senderPrincipalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      eventHubsDataSenderRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// RBAC — Storage Blob Data Contributor for Capture (EH system identity)
// ============================================================================

// Note: The Capture service uses the namespace's system-assigned identity.
// The RBAC assignment on the storage account is created here using the
// namespace's principal ID.

var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource captureStorageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: captureStorageAccountName
}

resource captureStorageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(captureStorageAccount.id, ehNamespace.id, storageBlobDataContributorRoleId)
  scope: captureStorageAccount
  properties: {
    principalId: ehNamespace.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataContributorRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output namespaceName string = ehNamespace.name
output namespaceFqdn string = '${ehNamespace.name}.servicebus.windows.net'
output namespaceId string = ehNamespace.id
output eventHubName string = graphEventsHub.name
