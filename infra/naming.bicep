// ============================================================================
// Shared Naming Conventions
// ============================================================================
// Single source of truth for all resource naming formulas.
// Import these functions wherever a resource name is needed to eliminate
// duplication and prevent naming drift between modules.
//
// Usage: import { aksClusterName, amwName } from 'naming.bicep'

@export()
func aksClusterName(baseName string, regionKey string, stampKey string) string =>
  'aks-${baseName}-${regionKey}-${stampKey}'

@export()
func amwName(baseName string, regionKey string) string =>
  'amw-${baseName}-${regionKey}'

@export()
func lawName(baseName string, regionKey string) string =>
  'law-${baseName}-${regionKey}'

@export()
func stampCosmosName(baseName string, regionKey string, stampKey string) string =>
  'cosmos-orl-${baseName}-${regionKey}-${stampKey}'

// Storage names must be ≤24 chars, lowercase, no hyphens.
@export()
func helloAgentsStorageName(baseName string, regionKey string, stampKey string) string =>
  take(replace('stha${take(baseName, 10)}${take(regionKey, 3)}${stampKey}', '-', ''), 24)

@export()
func graphOrleonsStorageName(baseName string, regionKey string, stampKey string) string =>
  take(replace('stgo${take(baseName, 10)}${take(regionKey, 3)}${stampKey}', '-', ''), 24)

@export()
func certManagerIdentityName(baseName string, regionKey string) string =>
  'id-certmanager-${baseName}-${regionKey}'

@export()
func childDnsZoneName(regionKey string, domainName string) string =>
  '${regionKey}.${domainName}'

@export()
func originHostname(appName string, regionKey string, stampKey string, domainName string) string =>
  '${appName}-${regionKey}-${stampKey}.${regionKey}.${domainName}:443'

@export()
func stampRgName(baseName string, regionKey string, stampKey string) string =>
  'rg-${baseName}-${regionKey}-${stampKey}'

@export()
func regionalRgName(baseName string, regionKey string) string =>
  'rg-${baseName}-${regionKey}'
