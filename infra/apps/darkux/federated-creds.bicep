// ============================================================================
// Federated Identity Credentials for DarkUxChallenge app identity
// Deployed per stamp — federates the app managed identity with the K8s
// ServiceAccount so pods can use DefaultAzureCredential via workload identity.
// ============================================================================

@description('App managed identity name.')
param identityName string

@description('Stamp name for unique credential naming.')
param stampName string

@description('AKS OIDC issuer URL for this stamp.')
param oidcIssuerUrl string

@description('Kubernetes namespace for the service account.')
param serviceAccountNamespace string

@description('Kubernetes service account name.')
param serviceAccountName string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource appFederatedCred 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: '${serviceAccountNamespace}-${serviceAccountName}-${stampName}'
  properties: {
    issuer: oidcIssuerUrl
    subject: 'system:serviceaccount:${serviceAccountNamespace}:${serviceAccountName}'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}
