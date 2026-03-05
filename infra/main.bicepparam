using 'main.bicep'

param baseName = 'alwayson'
param globalLocation = 'swedencentral'
param acrSku = 'Premium'
param cosmosAutoscaleMaxThroughput = 1000

param regions = {
  swedencentral: {
    location: 'swedencentral'
  }
  germanywestcentral: {
    location: 'germanywestcentral'
  }
}
