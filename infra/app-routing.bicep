// ============================================================================
// Generic App Front Door Routing
// Wires {subdomain}.{domainName} → Front Door → one origin per AKS stamp.
//
// Origin hostnames use a per-app DNS label per stamp (see ADR-0050):
//   {appName}-swedencentral-001.swedencentral.cloudapp.azure.com
//
// Each app deploys its own Istio Gateway with a unique DNS label set via:
//   service.beta.kubernetes.io/azure-dns-label-name: {appName}-{regionKey}-{stampKey}
// ============================================================================

@description('Domain name (e.g. alwayson.actor).')
param domainName string

@description('App name (used for Azure resource naming: origin group, route).')
param appName string

@description('Subdomain for this app (e.g. darkux → darkux.alwayson.actor).')
param subdomain string

@description('All stamps: array of { regionKey, stampKey, location }.')
param stamps array

@description('Health probe path for origin group (e.g. / or /health). Default: /')
param probePath string = '/'

@description('Front Door cache duration (ISO 8601, e.g. PT5M, PT1H). Empty string disables caching entirely.')
param cacheDuration string = ''

@description('Front Door profile name (from global module output).')
param frontDoorName string

@description('Front Door AFD endpoint name (from global module output).')
param frontDoorEndpointName string

// ============================================================================
// Existing resources
// ============================================================================

resource frontDoor 'Microsoft.Cdn/profiles@2025-04-15' existing = {
  name: frontDoorName
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-04-15' existing = {
  parent: frontDoor
  name: frontDoorEndpointName
}

resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: domainName
}

// ============================================================================
// Origin Group
// ============================================================================

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2025-04-15' = {
  parent: frontDoor
  name: 'og-${appName}'
  properties: {
    sessionAffinityState: 'Enabled'
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: probePath
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

// One origin per stamp.
// Gateway hostname uses the app-specific DNS label per stamp:
//   '{appName}-{stampName}.{regionKey}.{domainName}'
//
// The DNS label is set on each app's Istio Gateway LoadBalancer service
// at deploy time via the annotation:
//   service.beta.kubernetes.io/azure-dns-label-name: {appName}-{regionKey}-{stampKey}
resource origins 'Microsoft.Cdn/profiles/originGroups/origins@2025-04-15' = [
  for stamp in stamps: {
    parent: originGroup
    name: 'origin-${stamp.regionKey}-${stamp.stampKey}'
    properties: {
      hostName: '${appName}-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
      httpPort: 80
      httpsPort: 443
      originHostHeader: '${appName}-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
      priority: 1
      weight: 1000
      enabledState: 'Enabled'
    }
  }
]

// ============================================================================
// Custom Domain: {subdomain}.{domainName}
// ============================================================================

resource customDomain 'Microsoft.Cdn/profiles/customDomains@2025-04-15' = {
  parent: frontDoor
  name: '${subdomain}-${replace(domainName, '.', '-')}'
  properties: {
    hostName: '${subdomain}.${domainName}'
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
    azureDnsZone: {
      id: dnsZone.id
    }
  }
}

// CNAME: {subdomain}.{domainName} → Front Door endpoint
resource cnameRecord 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: dnsZone
  name: subdomain
  properties: {
    TTL: 300
    CNAMERecord: {
      cname: fdEndpoint.properties.hostName
    }
  }
}

// DNS validation TXT record (_dnsauth.{subdomain}) is auto-managed by Azure Front Door
// via the azureDnsZone linkage on the custom domain resource above.
// Do NOT create it manually — that causes stale token conflicts on redeployment.

// ============================================================================
// Route: {subdomain}.{domainName} → og-{appName}
// ============================================================================

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-04-15' = {
  parent: fdEndpoint
  name: 'route-${appName}'
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
    cacheConfiguration: cacheDuration != '' ? {
      queryStringCachingBehavior: 'IgnoreQueryString'
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: [
          'text/html'
          'text/css'
          'application/javascript'
          'application/json'
          'image/svg+xml'
          'application/font-woff2'
        ]
      }
    } : null
  }
}

// ============================================================================
// Outputs
// ============================================================================

// The DNS label set on each app's Istio Gateway LoadBalancer service per stamp:
//   service.beta.kubernetes.io/azure-dns-label-name: <value>
output stampOrigins array = [for (stamp, i) in stamps: {
  stampName: '${stamp.regionKey}-${stamp.stampKey}'
  gatewayHostname: '${appName}-${stamp.regionKey}-${stamp.stampKey}.${stamp.regionKey}.${domainName}'
}]

output hostname string = '${subdomain}.${domainName}'
