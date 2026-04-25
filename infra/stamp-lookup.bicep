// infra/stamp-lookup.bicep
// Reads existing stamp resources to expose runtime IDs for health models.
// Deployed per-stamp to work around BCP182 (can't use loop module outputs in var for-expressions).

param baseName string
param regionKey string
param stampKey string

var stampName = '${regionKey}-${stampKey}'

resource aksCluster 'Microsoft.ContainerService/managedClusters@2024-09-01' existing = {
  name: 'aks-${baseName}-${stampName}'
}

resource stampCosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' existing = {
  name: 'cosmos-orl-${baseName}-${regionKey}-${stampKey}'
}

// Storage names: ≤24 chars, lowercase, no hyphens
var haStorageNameRaw = replace('stha${take(baseName, 10)}${take(regionKey, 3)}${stampKey}', '-', '')
var haStorageName = length(haStorageNameRaw) > 24 ? substring(haStorageNameRaw, 0, 24) : haStorageNameRaw

resource helloAgentsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: haStorageName
}

output aksClusterId string = aksCluster.id
output stampCosmosAccountId string = stampCosmos.id
output helloAgentsStorageId string = helloAgentsStorage.id
