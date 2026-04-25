// ============================================================================
// Stamp-Level Serverless Cosmos DB for Orleans Clustering
//
// Each stamp gets its own Cosmos DB account for Orleans membership and pubsub.
// Serverless mode — no throughput provisioning needed.
// Single-region — ephemeral clustering data, no replication.
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Location for resources.')
param location string

@description('Region key (short name, e.g. swedencentral). Used in resource naming.')
param regionKey string

@description('Stamp key (e.g. 001). Used in resource naming to disambiguate multiple stamps per region.')
param stampKey string

@description('App identities that need Cosmos RBAC. Each entry: { name, principalId }')
param appIdentities array

// ============================================================================
import { stampCosmosName } from 'naming.bicep'

// Cosmos DB Account (Serverless, single region)
// ============================================================================

// stampKey is included so multiple stamps in the same region don't collide.
var cosmosName = stampCosmosName(baseName, regionKey, stampKey)
var orleansDbName = 'orleans'

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

// ============================================================================
// Database (no throughput — Serverless)
// ============================================================================

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: orleansDbName
  properties: {
    resource: {
      id: orleansDbName
    }
  }
}

// ============================================================================
// Containers
// ============================================================================

var containers = [
  { name: 'helloorleons-cluster', partitionKeyPath: '/ClusterId' }
  { name: 'graphorleons-cluster', partitionKeyPath: '/ClusterId' }
  { name: 'graphorleons-pubsub', partitionKeyPath: '/PartitionKey' }
  { name: 'helloagents-cluster', partitionKeyPath: '/ClusterId' }
  { name: 'helloagents-pubsub', partitionKeyPath: '/PartitionKey' }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = [
  for container in containers: {
    parent: database
    name: container.name
    properties: {
      resource: {
        id: container.name
        partitionKey: {
          paths: [container.partitionKeyPath]
          kind: 'Hash'
          version: 2
        }
      }
    }
  }
]

// ============================================================================
// Custom RBAC Role — Scoped data access (no database/container creation)
// ============================================================================

var cosmosAppRoleId = guid(cosmos.id, 'app-data-readwrite')

resource cosmosAppRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleDefinitions@2025-04-15' = {
  parent: cosmos
  name: cosmosAppRoleId
  properties: {
    roleName: 'App Data Read/Write'
    type: 'CustomRole'
    assignableScopes: [
      cosmos.id
    ]
    permissions: [
      {
        dataActions: [
          'Microsoft.DocumentDB/databaseAccounts/readMetadata'
          'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/*'
          'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/executeQuery'
          'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/readChangeFeed'
        ]
      }
    ]
  }
}

// ============================================================================
// RBAC Assignments — scoped to orleans database, one per app identity
// ============================================================================

resource cosmosRbac 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = [
  for identity in appIdentities: {
    parent: cosmos
    name: guid(cosmos.id, identity.principalId, cosmosAppRoleId)
    properties: {
      principalId: identity.principalId
      roleDefinitionId: cosmosAppRole.id
      scope: '${cosmos.id}/dbs/${orleansDbName}'
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosName string = cosmos.name
output cosmosId string = cosmos.id
output orleansDbName string = orleansDbName
output containerNames array = [for (c, i) in containers: cosmosContainers[i].name]

// Named map of Orleans containers so consumers don't rely on positional indexing.
// Keys mirror the container names (camelCased) for stability.
output orleansContainers object = {
  helloorleonsCluster: cosmosContainers[0].name
  graphorleonsCluster: cosmosContainers[1].name
  graphorleonsPubsub: cosmosContainers[2].name
  helloagentsCluster: cosmosContainers[3].name
  helloagentsPubsub: cosmosContainers[4].name
}
