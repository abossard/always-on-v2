// ============================================================================
// Level0 Front Door Routing
// Wires level0.{domainName} → Front Door → one origin per AKS stamp.
//
// Origin hostnames use a deterministic DNS label per stamp:
//   level0-swedencentral-001.swedencentral.cloudapp.azure.com
//
// The DNS label is set on the Istio ingress gateway LoadBalancer service
// at deploy time via the annotation:
//   service.beta.kubernetes.io/azure-dns-label-name: level0-{regionKey}-{stampKey}
// ============================================================================

@description('Base name for all resources.')
param baseName string

@description('Domain name (e.g. alwayson.actor).')
param domainName string

@description('All stamps: array of { regionKey, stampKey, location }.')
param stamps array

// ============================================================================
// Existing resources
// ============================================================================

resource frontDoor 'Microsoft.Cdn/profiles@2025-04-15' existing = {
  name: 'fd-${baseName}'
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-04-15' existing = {
  parent: frontDoor
  name: 'ep-${baseName}'
}

resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: domainName
}

// ============================================================================
// Origin Group
// ============================================================================

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2025-04-15' = {
  parent: frontDoor
  name: 'og-level0'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

// One origin per stamp.
// Gateway hostname mirrors the GATEWAY_HOSTNAME Flux variable in stamp.bicep:
//   'level0-${stampName}.${dnsZoneName}' where stampName = regionKey-stampKey
//   and dnsZoneName = regionKey.domainName
resource origins 'Microsoft.Cdn/profiles/originGroups/origins@2025-04-15' = [
  for stamp in stamps: {
    parent: originGroup
    name: 'origin-${stamp.regionKey}-${stamp.stampKey}'
    properties: {
      hostName: 'level0-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
      httpPort: 80
      httpsPort: 443
      originHostHeader: 'level0-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
      priority: 1
      weight: 1000
      enabledState: 'Enabled'
    }
  }
]

// ============================================================================
// Custom Domain: level0.{domainName}
// ============================================================================

resource customDomain 'Microsoft.Cdn/profiles/customDomains@2025-04-15' = {
  parent: frontDoor
  name: 'level0-${replace(domainName, '.', '-')}'
  properties: {
    hostName: 'level0.${domainName}'
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
    azureDnsZone: {
      id: dnsZone.id
    }
  }
}

// CNAME: level0.{domainName} → Front Door endpoint
resource cnameLevel0 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: dnsZone
  name: 'level0'
  properties: {
    TTL: 300
    CNAMERecord: {
      cname: fdEndpoint.properties.hostName
    }
  }
}

// DNS validation TXT record (_dnsauth.level0) is auto-managed by Azure Front Door
// via the azureDnsZone linkage on the custom domain resource above.
// Do NOT create it manually — that causes stale token conflicts on redeployment.

// ============================================================================
// Route: level0.{domainName} → og-level0
// ============================================================================

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-04-15' = {
  parent: fdEndpoint
  name: 'route-level0'
  properties: {
    customDomains: [
      { id: customDomain.id }
    ]
    originGroup: { id: originGroup.id }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Disabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
}

// ============================================================================
// Outputs
// ============================================================================

// The DNS label to set on the Istio ingress gateway LoadBalancer service per stamp:
//   service.beta.kubernetes.io/azure-dns-label-name: <value>
output stampOrigins array = [for (stamp, i) in stamps: {
  stampName: '${stamp.regionKey}-${stamp.stampKey}'
  gatewayHostname: 'level0-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
}]

output level0Hostname string = 'level0.${domainName}'
