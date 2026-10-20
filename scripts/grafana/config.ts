export interface StampConfig {
  key: string;
  region: string;
  cluster: string;
  resourceGroup: string;
  storageAccount?: string;
  cosmosOrleansAccount?: string;
}

export interface AppConfig {
  name: string;
  displayName: string;
  namespace: string;
  subdomain: string;
  usesAI: boolean;
  usesQueues: boolean;
  usesBlobs: boolean;
  usesEventHubs: boolean;
  usesOrleans: boolean;
}

export interface ResourceConfig {
  cosmosAccount: string;
  frontDoorProfile: string;
  aiServicesAccount: string;
  eventHubsNamespace?: string;
  captureStorageAccount?: string;
}

export interface AiDeploymentSnapshot {
  deployment: string;
  allocatedTpm: number | null;
  allocatedRpm: number | null;
}

export interface AiQuotaSnapshot {
  model: string;
  allocatedUnits: number | null;
  quotaUnits: number | null;
}

export interface AiObservabilityConfig {
  subscription: string;
  resourceGroup: string;
  accountName: string;
  observedAtUtc: string;
  deploymentAllocations: AiDeploymentSnapshot[];
  quotaSnapshots: AiQuotaSnapshot[];
}

export interface PlatformConfig {
  tenantId?: string;
  subscription: string;
  globalResourceGroup: string;
  domainName: string;
  resources: ResourceConfig;
  aiObservability?: AiObservabilityConfig;
  stamps: StampConfig[];
  apps: AppConfig[];
}
