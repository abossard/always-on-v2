// ============================================================================
// Federated Identity Credentials for DNS identity
// Deployed to the regional RG where the identity lives.
// Creates one federated credential per ServiceAccount per stamp.
// ============================================================================

@description('DNS managed identity name.')
param identityName string

@description('Stamp name for unique credential naming.')
param stampName string

@description('AKS OIDC issuer URL for this stamp.')
param oidcIssuerUrl string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource certManagerFederatedCred 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'cert-manager-${stampName}'
  properties: {
    issuer: oidcIssuerUrl
    subject: 'system:serviceaccount:cert-manager:cert-manager-cert-manager'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}

resource externalDnsFederatedCred 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'external-dns-${stampName}'
  properties: {
    issuer: oidcIssuerUrl
    subject: 'system:serviceaccount:external-dns:external-dns-external-dns'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}
