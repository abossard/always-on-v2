// ============================================================================
// Stamp Resource Lookup
// ============================================================================
// Reads existing stamp-scoped resources by name to expose their resource IDs.
// Deployed once per stamp to work around Bicep BCP182 codegen bug where
// stamps[i].outputs.X generates incorrect ARM copyIndex() when consumed
// by non-loop modules or var for-expressions.
//
// All naming formulas imported from naming.bicep — single source of truth.

import {
  aksClusterName
  stampCosmosName
  helloAgentsStorageName
  graphOrleonsStorageName
} from 'naming.bicep'

@description('Base name for resource naming.')
param baseName string

@description('Region key (e.g. swedencentral).')
param regionKey string

@description('Stamp key (e.g. 002).')
param stampKey string

resource aksCluster 'Microsoft.ContainerService/managedClusters@2026-01-01' existing = {
  name: aksClusterName(baseName, regionKey, stampKey)
}

resource stampCosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: stampCosmosName(baseName, regionKey, stampKey)
}

resource helloAgentsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: helloAgentsStorageName(baseName, regionKey, stampKey)
}

resource graphOrleonsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: graphOrleonsStorageName(baseName, regionKey, stampKey)
}

output aksClusterId string = aksCluster.id
output aksClusterName string = aksCluster.name
output stampCosmosAccountId string = stampCosmos.id
output helloAgentsStorageId string = helloAgentsStorage.id
output graphOrleonsStorageId string = graphOrleonsStorage.id
