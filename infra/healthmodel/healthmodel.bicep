// ============================================================================
// Health Model — Microsoft.CloudHealth/healthmodels (preview)
// ============================================================================
// Deploys a health model with a user-assigned managed identity.
// RBAC for the identity is handled externally (subscription-scope in main.bicep).

// ─── Parameters ─────────────────────────────────────────────────

@description('Name of the health model resource.')
param name string

@description('Azure region for the health model resource.')
param location string

@description('Resource ID of the user-assigned managed identity for the health model.')
param identityId string

@description('Resource ID of the Application Insights component for topology discovery.')
param appInsightsId string = ''

@description('Whether to add recommended signals during discovery.')
param addRecommendedSignals bool = true

@description('Whether to discover relationships between resources.')
param discoverRelationships bool = true

// ─── Variables ──────────────────────────────────────────────────

var identityName = last(split(identityId, '/'))
var enableDiscovery = !empty(appInsightsId)
var discoveryRuleGuid = guid(appInsightsId)

// ─── Health Model ───────────────────────────────────────────────

resource healthmodel 'Microsoft.CloudHealth/healthmodels@2026-01-01-preview' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {}
}

// ─── Authentication Setting (for the managed identity) ──────────

resource authsetting 'Microsoft.CloudHealth/healthmodels/authenticationsettings@2026-01-01-preview' = {
  name: toLower(identityName)
  parent: healthmodel
  properties: {
    displayName: identityName
    authenticationKind: 'ManagedIdentity'
    managedIdentityName: identityId
  }
}

// ─── Discovery Rule (Application Insights topology) ─────────────

resource discoveryRule 'Microsoft.CloudHealth/healthmodels/discoveryrules@2026-01-01-preview' = if (enableDiscovery) {
  name: discoveryRuleGuid
  parent: healthmodel
  properties: {
    displayName: 'appin'
    addRecommendedSignals: addRecommendedSignals ? 'Enabled' : 'Disabled'
    authenticationSetting: authsetting.name
    discoverRelationships: discoverRelationships ? 'Enabled' : 'Disabled'
    specification: {
      kind: 'ApplicationInsightsTopology'
      applicationInsightsResourceId: appInsightsId
    }
  }
}

// ─── Root ↔ Discovery Rule Relationship ─────────────────────────

resource rootDiscoveryRelationship 'Microsoft.CloudHealth/healthmodels/relationships@2026-01-01-preview' = if (enableDiscovery) {
  name: guid('root-${discoveryRuleGuid}-discovery-relationship')
  parent: healthmodel
  properties: {
    parentEntityName: name
    childEntityName: discoveryRule.name
  }
}

// ─── Outputs ────────────────────────────────────────────────────

output healthModelId string = healthmodel.id
output healthModelName string = healthmodel.name
