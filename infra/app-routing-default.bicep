// ============================================================================
// Default App Front Door Routing (no custom domain)
// Creates a per-app Front Door endpoint with origins pointing to AKS stamps
// using Azure-provided cloudapp.azure.com DNS labels.
// ============================================================================

@description('App name (used for Azure resource naming).')
param appName string

@description('All stamps: array of { regionKey, stampKey, location }.')
param stamps array

@description('Health probe path. Default: /')
param probePath string = '/'

@description('Front Door profile name.')
param frontDoorName string

// ============================================================================
// Existing resources
// ============================================================================

resource frontDoor 'Microsoft.Cdn/profiles@2025-04-15' existing = {
  name: frontDoorName
}

// ============================================================================
// Per-App Endpoint
// ============================================================================

resource appEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2025-04-15' = {
  parent: frontDoor
  name: 'ep-${appName}'
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// ============================================================================
// Origin Group
// ============================================================================

resource originGroup 'Microsoft.Cdn/profiles/originGroups@2025-04-15' = {
  parent: frontDoor
  name: 'og-${appName}-default'
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
      probeProtocol: 'Http'
      probeIntervalInSeconds: 30
    }
  }
}

// One origin per stamp using Azure-provided DNS label
resource origins 'Microsoft.Cdn/profiles/originGroups/origins@2025-04-15' = [
  for stamp in stamps: {
    parent: originGroup
    name: 'origin-${stamp.regionKey}-${stamp.stampKey}'
    properties: {
      hostName: '${appName}-${stamp.regionKey}-${stamp.stampKey}.${stamp.location}.cloudapp.azure.com'
      httpPort: 80
      httpsPort: 443
      originHostHeader: '${appName}-${stamp.regionKey}-${stamp.stampKey}.${stamp.location}.cloudapp.azure.com'
      priority: 1
      weight: 1000
      enabledState: 'Enabled'
    }
  }
]

// ============================================================================
// Route on per-app endpoint (default domain)
// ============================================================================

resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2025-04-15' = {
  parent: appEndpoint
  name: 'route-${appName}'
  dependsOn: [origins]
  properties: {
    originGroup: { id: originGroup.id }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'HttpOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output hostname string = appEndpoint.properties.hostName
