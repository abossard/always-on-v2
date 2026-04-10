export interface StampConfig {
  key: string;
  region: string;
  cluster: string;
}

export interface AppConfig {
  name: string;
  displayName: string;
  namespace: string;
  subdomain: string;
  usesAI: boolean;
  usesQueues: boolean;
}

export interface ResourceConfig {
  cosmosAccount: string;
  frontDoorProfile: string;
  aiServicesAccount: string;
}

export interface PlatformConfig {
  subscription: string;
  globalResourceGroup: string;
  domainName: string;
  resources: ResourceConfig;
  stamps: StampConfig[];
  apps: AppConfig[];
}
