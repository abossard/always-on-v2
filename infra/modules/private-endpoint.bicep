// ============================================================================
// Reusable Private Endpoint + fully-managed Private DNS registration
//
// Creates a private endpoint into the given subnet, then a privateDnsZoneGroup
// so Azure auto-manages the DNS A-records (create/update on region changes,
// delete on PE removal). One zone config per supplied private DNS zone id —
// e.g. AI Services (groupId 'account') needs three zones in one PE.
// ============================================================================

@description('Private endpoint name.')
param name string

@description('Location — must match the VNet/subnet region.')
param location string

@description('Subnet resource id the private IP is allocated from.')
param subnetId string

@description('Target private-link resource id.')
param targetResourceId string

@description('Group IDs (sub-resources) for the connection, e.g. ["Sql"], ["account"], ["blob"].')
param groupIds array

@description('Private DNS zone resource ids to register records in (one or more).')
param privateDnsZoneIds array

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: name
  location: location
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: name
        properties: {
          privateLinkServiceId: targetResourceId
          groupIds: groupIds
        }
      }
    ]
  }
}

resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      for (zoneId, i) in privateDnsZoneIds: {
        name: 'config-${i}'
        properties: {
          privateDnsZoneId: zoneId
        }
      }
    ]
  }
}

output privateEndpointId string = privateEndpoint.id
