using 'main.bicep'

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param acrSku = 'Premium'
param cosmosAutoscaleMaxThroughput = 1000

param regions = [
  { key: 'swedencentral', location: 'swedencentral' }
  { key: 'germanywestcentral', location: 'germanywestcentral' }
]
