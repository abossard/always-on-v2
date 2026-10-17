// ============================================================================
// Per-stamp network — VNet, subnets (Bicep native CIDR math), and the full
// set of privatelink private DNS zones + VNet links.
//
// This is the DNS abstraction for private networking: every privatelink zone a
// stamp needs (local + global services) is created once here and linked to the
// stamp VNet, so Azure DNS resolves *.privatelink.* to the local PE IP.
// One VNet per STAMP; no peering — overlap across stamps is fine.
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Stamp name (regionKey-stampKey), used in resource naming.')
param stampName string

@description('Region key (short name, e.g. swedencentral), used in naming.')
param regionKey string

@description('Location for the VNet.')
param location string

@description('Per-stamp VNet address space (CIDR). Carved into subnets below.')
param addressPrefix string

@description('Enable custom-domain routing mode. False means cloudapp origin mode.')
param enableCustomDomain bool

@description('AKS ingress mode. External uses public LB, Internal uses private LB.')
@allowed([
  'External'
  'Internal'
])
param aksIngressType string

// ── Subnet math via Bicep native CIDR functions ──────────────────────────────
// aks  = first /22 of the space (node NICs; pods use overlay IPs)
// pe   = a /24 carved past the AKS block (private endpoint NICs)
// e.g. 10.128.0.0/16 -> aks 10.128.0.0/22, pe 10.128.4.0/24 (non-overlapping)
var aksSubnetPrefix = cidrSubnet(addressPrefix, 22, 0)
var peSubnetPrefix = cidrSubnet(addressPrefix, 24, 4)

var aksSubnetName = 'aks'
var peSubnetName = 'private-endpoints'
var aksSubnetNsgName = 'vnet-${baseName}-${stampName}-aks-nsg-${regionKey}'
var peSubnetNsgName = 'vnet-${baseName}-${stampName}-${peSubnetName}-nsg-${regionKey}'
var frontDoorDestinationPorts = enableCustomDomain ? [
  '80'
  '443'
] : [
  '80'
]

resource aksSubnetNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: aksSubnetNsgName
  location: location
  properties: {
    securityRules: aksIngressType == 'External' ? [
      {
        name: 'allow-frontdoor-backend-http'
        properties: {
          access: 'Allow'
          direction: 'Inbound'
          priority: 500
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRanges: frontDoorDestinationPorts
          sourceAddressPrefix: 'AzureFrontDoor.Backend'
          destinationAddressPrefix: '*'
        }
      }
    ] : []
  }
}

resource peSubnetNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: peSubnetNsgName
  location: location
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${baseName}-${stampName}'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressPrefix
      ]
    }
    subnets: [
      {
        name: aksSubnetName
        properties: {
          addressPrefix: aksSubnetPrefix
          networkSecurityGroup: {
            id: aksSubnetNsg.id
          }
        }
      }
      {
        name: peSubnetName
        properties: {
          addressPrefix: peSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
          networkSecurityGroup: {
            id: peSubnetNsg.id
          }
        }
      }
    ]
  }
}

// ── privatelink private DNS zones (local + global services) ───────────────────
// Keys are stable; consumers select zones by key from the zoneIds output.
var privateDnsZoneDefs = [
  { key: 'documents', name: 'privatelink.documents.azure.com' } // Cosmos (SQL)
  { key: 'blob', name: 'privatelink.blob.${environment().suffixes.storage}' }
  { key: 'queue', name: 'privatelink.queue.${environment().suffixes.storage}' }
  { key: 'file', name: 'privatelink.file.${environment().suffixes.storage}' }
  { key: 'vault', name: 'privatelink.vaultcore.azure.net' } // Key Vault
  { key: 'cognitiveservices', name: 'privatelink.cognitiveservices.azure.com' }
  { key: 'openai', name: 'privatelink.openai.azure.com' }
  { key: 'servicesai', name: 'privatelink.services.ai.azure.com' }
  { key: 'servicebus', name: 'privatelink.servicebus.windows.net' } // Event Hubs
  { key: 'amlapi', name: 'privatelink.api.azureml.ms' }
  { key: 'amlnotebooks', name: 'privatelink.notebooks.azure.net' }
]

resource privateDnsZones 'Microsoft.Network/privateDnsZones@2024-06-01' = [
  for z in privateDnsZoneDefs: {
    name: z.name
    location: 'global'
  }
]

resource privateDnsZoneLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [
  for (z, i) in privateDnsZoneDefs: {
    parent: privateDnsZones[i]
    name: 'link-${stampName}'
    location: 'global'
    properties: {
      registrationEnabled: false
      virtualNetwork: {
        id: vnet.id
      }
    }
  }
]

// ============================================================================
// Outputs
// ============================================================================

output vnetId string = vnet.id
output aksSubnetId string = '${vnet.id}/subnets/${aksSubnetName}'
output peSubnetId string = '${vnet.id}/subnets/${peSubnetName}'

// Map of zone key -> private DNS zone id, consumed by private-endpoint modules.
output zoneIds object = {
  documents: privateDnsZones[0].id
  blob: privateDnsZones[1].id
  queue: privateDnsZones[2].id
  file: privateDnsZones[3].id
  vault: privateDnsZones[4].id
  cognitiveservices: privateDnsZones[5].id
  openai: privateDnsZones[6].id
  servicesai: privateDnsZones[7].id
  servicebus: privateDnsZones[8].id
  amlapi: privateDnsZones[9].id
  amlnotebooks: privateDnsZones[10].id
}
