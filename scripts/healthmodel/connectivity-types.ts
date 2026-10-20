export const connectivityModelIds = [
  'hm-demo-connectivity-alwaysonn-regional',
  'hm-demo-connectivity-alwaysonn-vwan',
  'hm-demo-connectivity-alwaysonn-hybrid',
  'hm-demo-connectivity-alwaysonn-dns',
] as const;

export type ConnectivityModelId = (typeof connectivityModelIds)[number];

export type ConnectivityEntityRole = 'root' | 'serviceGroup' | 'contextGroup' | 'syntheticLeaf';

export type ConnectivityEntityImpact = 'Standard' | 'Limited' | 'Suppressed';

export type ConnectivityRollupStrategy = 'WorstOf' | 'BestOf';

export type ConnectivityHealthState = 'Healthy' | 'Degraded' | 'Unhealthy' | 'Unknown';

export interface ConnectivityRollup {
  readonly strategy: ConnectivityRollupStrategy;
  readonly ignoreUnknown?: boolean;
}

export interface ConnectivityEntityDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly role: ConnectivityEntityRole;
  readonly impact?: ConnectivityEntityImpact;
  readonly provenance: 'simulated' | 'real-context';
  readonly canonicalIdentity?: string;
  readonly realContextBindingKey?: string;
  readonly rollup?: ConnectivityRollup;
}

export interface ConnectivityRelationshipDefinition {
  readonly id: string;
  readonly parentEntityId: string;
  readonly childEntityId: string;
}

export interface ConnectivitySceneReport {
  readonly entityId: string;
  readonly signalName: string;
  readonly healthState: ConnectivityHealthState;
  readonly ttlSeconds: number;
  readonly context: Record<string, string>;
}

export interface ConnectivitySceneOmittedReport {
  readonly entityId: string;
  readonly signalName: string;
}

export interface ConnectivitySceneDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly readiness: 'scene-ready' | 'evidence-gap';
  readonly reports: readonly ConnectivitySceneReport[];
  readonly omittedReports?: readonly ConnectivitySceneOmittedReport[];
}

export interface ConnectivityModelDefinition {
  readonly id: ConnectivityModelId;
  readonly displayName: string;
  readonly entities: readonly ConnectivityEntityDefinition[];
  readonly relationships: readonly ConnectivityRelationshipDefinition[];
  readonly publishedLeafSignals: Readonly<Record<string, readonly string[]>>;
  readonly scenes: readonly ConnectivitySceneDefinition[];
}

export interface ConnectivityCatalogDefinition {
  readonly models: readonly ConnectivityModelDefinition[];
}

export interface ConnectivityTargetBinding {
  readonly targetName: ConnectivityModelId;
  readonly hostRegion: string;
  readonly subject: string;
  readonly authenticationSettingName: string;
  readonly resourceBindings: Readonly<Record<string, {
    readonly azureResourceId: string;
  }>>;
}

export interface ConnectivityBindingManifest {
  readonly targets: Readonly<Record<ConnectivityModelId, ConnectivityTargetBinding>>;
}

export interface ConnectivityCompiledModel extends ConnectivityModelDefinition {
  readonly binding: ConnectivityTargetBinding;
  readonly publisherPlan: ReadonlyArray<{
    readonly sceneId: string;
    readonly readiness: 'scene-ready' | 'evidence-gap';
    readonly reports: ReadonlyArray<{
      readonly entityId: string;
      readonly signalName: string;
      readonly healthState: ConnectivityHealthState;
      readonly expiresInMinutes: number;
      readonly additionalContext: string;
    }>;
    readonly omittedReports: readonly ConnectivitySceneOmittedReport[];
  }>;
}

export interface ConnectivityCompiledCatalog {
  readonly models: readonly ConnectivityCompiledModel[];
}

export interface CompileConnectivityCatalogInput {
  readonly catalog: ConnectivityCatalogDefinition;
  readonly bindings: ConnectivityBindingManifest;
  readonly options: {
    readonly ignoreUnknownPolicy: 'explicit';
  };
}
