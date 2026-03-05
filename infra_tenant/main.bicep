// ============================================================================
// Tenant-Level Deployment — Azure Service Group
//
// Creates a Service Group that logically groups all resource groups.
// Membership is added via post-deployment CLI calls (see deploy.sh).
//
// Deployed via: az deployment tenant create
// ============================================================================
targetScope = 'tenant'

@minLength(3)
@maxLength(12)
@description('Base name (must match the infra deployment).')
param baseName string

@description('Tenant ID (root service group parent).')
param tenantId string

// ============================================================================
// Service Group
// ============================================================================

resource serviceGroup 'Microsoft.Management/serviceGroups@2024-02-01-preview' = {
  name: 'sg-${baseName}'
  properties: {
    displayName: 'Always-On ${baseName}'
    parent: {
      resourceId: '/providers/Microsoft.Management/serviceGroups/${tenantId}'
    }
  }
  tags: {
    workload: baseName
    managedBy: 'bicep'
  }
}

// ============================================================================
// Outputs
// ============================================================================

output serviceGroupId string = serviceGroup.id
output serviceGroupName string = serviceGroup.name
