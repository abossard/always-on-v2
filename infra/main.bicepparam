using 'main.bicep'

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param acrSku = 'Premium'
param cosmosAutoscaleMaxThroughput = 1000
param domainName = 'alwayson.actor'

param regions = [
  {
    key: 'swedencentral'
    location: 'swedencentral'
    stamps: [ { key: '001' } ]
  }
  {
    key: 'germanywestcentral'
    location: 'germanywestcentral'
    stamps: [ { key: '001' } ]
  }
]
