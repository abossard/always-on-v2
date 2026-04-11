export interface StampConfig {
  key: string;
  region: string;
  cluster: string;
  resourceGroup: string;
  storageAccount?: string;
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
}

export interface ResourceConfig {
  cosmosAccount: string;
  frontDoorProfile: string;
  aiServicesAccount: string;
  eventHubsNamespace?: string;
}

export interface PlatformConfig {
  subscription: string;
  globalResourceGroup: string;
  domainName: string;
  resources: ResourceConfig;
  stamps: StampConfig[];
  apps: AppConfig[];
}
