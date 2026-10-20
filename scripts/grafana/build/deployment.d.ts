import type { PlatformConfig } from './config';
type Outputs = Record<string, {
    value: string;
}>;
export interface DeploymentMetadata {
    account: {
        id: string;
        tenantId: string;
    };
    environment: Record<string, string>;
    globalOutputs: Outputs;
    stampOutputs: Outputs[];
}
export declare function bindDeploymentConfig(base: PlatformConfig, metadata: DeploymentMetadata): PlatformConfig;
export declare function loadDeploymentConfig(base: PlatformConfig, environmentName: string, subscription: string, resourceGroup: string): PlatformConfig;
export {};
