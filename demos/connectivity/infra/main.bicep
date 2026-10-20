targetScope = 'resourceGroup'

@description('Connectivity demo model location')
param location string = resourceGroup().location

@description('Subscription id used for explicit target model ID outputs')
param subscriptionId string = subscription().subscriptionId

@description('Global resource group that hosts connectivity demos and referenced context resources')
param globalResourceGroupName string = resourceGroup().name

module connectivityDemoPlan '../../../infra/healthmodel/connectivity-demos.bicep' = {
  name: 'connectivity-demos-plan'
  params: {
    location: location
  }
}

output plannedLocation string = location
output targetModelIds array = [
  '/subscriptions/${subscriptionId}/resourceGroups/${globalResourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-regional'
  '/subscriptions/${subscriptionId}/resourceGroups/${globalResourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-vwan'
  '/subscriptions/${subscriptionId}/resourceGroups/${globalResourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-hybrid'
  '/subscriptions/${subscriptionId}/resourceGroups/${globalResourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/hm-demo-connectivity-alwaysonn-dns'
]
