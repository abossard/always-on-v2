// ============================================================================
// Health Model TypeScript Types — Microsoft.CloudHealth 2026-01-01-preview
// ============================================================================
// Derived from the TypeSpec at:
//   azure-rest-api-specs/specification/monitoringservice/resource-manager/
//   Microsoft.Monitor/Accounts/typespec/healthmodels/models.tsp

// ─── Enums / Unions ─────────────────────────────────────────────────

export type SignalKind = 'AzureResourceMetric' | 'PrometheusMetricsQuery' | 'LogAnalyticsQuery' | 'External';

export type AggregationType = 'Average' | 'Count' | 'Maximum' | 'Minimum' | 'Total' | 'None';

export type ThresholdOperator =
  | 'GreaterThan'
  | 'GreaterThanOrEqual'
  | 'LessThan'
  | 'LessThanOrEqual'
  | 'Equal'
  | 'NotEqual';

export type EntityImpact = 'Standard' | 'Limited' | 'Suppressed';

export type RefreshInterval = 'PT1M' | 'PT5M' | 'PT10M' | 'PT30M' | 'PT1H' | 'PT2H';

export type AlertSeverity = 'Sev0' | 'Sev1' | 'Sev2' | 'Sev3' | 'Sev4';

export type DependenciesAggregationType = 'WorstOf' | 'Thresholds';

export type AuthenticationKind = 'ManagedIdentity';

// ─── Threshold / Evaluation ─────────────────────────────────────────

export interface ThresholdRule {
  operator: ThresholdOperator;
  threshold: number;
}

export interface EvaluationRules {
  degradedRule?: ThresholdRule;
  unhealthyRule: ThresholdRule;
}

// ─── Unified Threshold (shared between Grafana + Health Model) ──────

export type ThresholdDirection = 'higher-is-worse' | 'lower-is-worse';

export interface UnifiedThreshold {
  direction: ThresholdDirection;
  /** Yellow / degraded boundary */
  degraded: number;
  /** Red / unhealthy boundary */
  unhealthy: number;
}

/** Convert a UnifiedThreshold to Health Model evaluation rules. */
export function toHealthModelRules(t: UnifiedThreshold): EvaluationRules {
  const operator: ThresholdOperator = t.direction === 'higher-is-worse' ? 'GreaterThan' : 'LessThan';
  return {
    degradedRule: { operator, threshold: t.degraded },
    unhealthyRule: { operator, threshold: t.unhealthy },
  };
}

/** Convert a UnifiedThreshold to Grafana threshold steps (green → yellow → red). */
export function toGrafanaThresholds(t: UnifiedThreshold): GrafanaThresholdStep[] {
  if (t.direction === 'higher-is-worse') {
    return [
      { color: 'green', value: null },
      { color: 'yellow', value: t.degraded },
      { color: 'red', value: t.unhealthy },
    ];
  }
  // lower-is-worse: red at bottom, green at top
  return [
    { color: 'red', value: null },
    { color: 'yellow', value: t.unhealthy },
    { color: 'green', value: t.degraded },
  ];
}

export interface GrafanaThresholdStep {
  color: string;
  value: number | null;
}

// ─── Signal Definitions ─────────────────────────────────────────────

interface BaseSignal {
  signalKind: SignalKind;
  displayName: string;
  refreshInterval?: RefreshInterval;
  dataUnit?: string;
  threshold: UnifiedThreshold;
}

export interface AzureResourceSignalDef extends BaseSignal {
  signalKind: 'AzureResourceMetric';
  metricNamespace: string;
  metricName: string;
  timeGrain: string;
  aggregationType: AggregationType;
  dimension?: string;
  dimensionFilter?: string;
}

export interface PrometheusSignalDef extends BaseSignal {
  signalKind: 'PrometheusMetricsQuery';
  queryText: string;
  timeGrain?: string;
}

export interface LogAnalyticsSignalDef extends BaseSignal {
  signalKind: 'LogAnalyticsQuery';
  queryText: string;
  timeGrain?: string;
  valueColumnName?: string;
}

export type SignalDef = AzureResourceSignalDef | PrometheusSignalDef | LogAnalyticsSignalDef;

// ─── Entity ─────────────────────────────────────────────────────────

export interface EntityCoordinates {
  x: number;
  y: number;
}

export interface IconDefinition {
  iconName: string;
  customData?: string;
}

export interface AlertConfiguration {
  severity: AlertSeverity;
  description?: string;
  actionGroupIds?: string[];
}

export interface EntityAlerts {
  unhealthy?: AlertConfiguration;
  degraded?: AlertConfiguration;
}

export interface DependenciesSignalGroup {
  aggregationType: DependenciesAggregationType;
  degradedThreshold?: number;
  unhealthyThreshold?: number;
}

export interface AzureResourceSignalGroup {
  authenticationSetting: string;
  azureResourceId: string;
  signals: AzureResourceSignalDef[];
}

export interface PrometheusSignalGroup {
  authenticationSetting: string;
  azureMonitorWorkspaceResourceId: string;
  signals: PrometheusSignalDef[];
}

export interface LogAnalyticsSignalGroup {
  authenticationSetting: string;
  logAnalyticsWorkspaceResourceId: string;
  signals: LogAnalyticsSignalDef[];
}

export interface SignalGroups {
  azureResource?: AzureResourceSignalGroup;
  azureMonitorWorkspace?: PrometheusSignalGroup;
  azureLogAnalytics?: LogAnalyticsSignalGroup;
  dependencies?: DependenciesSignalGroup;
}

export interface EntityDef {
  name: string;
  displayName: string;
  canvasPosition?: EntityCoordinates;
  icon?: IconDefinition;
  impact?: EntityImpact;
  healthObjective?: number;
  tags?: Record<string, string>;
  signalGroups?: SignalGroups;
  alerts?: EntityAlerts;
}

// ─── Relationship ───────────────────────────────────────────────────

export interface RelationshipDef {
  name: string;
  parentEntityName: string;
  childEntityName: string;
}

// ─── Signal Definition (top-level, reusable) ────────────────────────

export type SignalDefinitionDef = SignalDef & {
  name: string;
};

// ─── Authentication Setting ─────────────────────────────────────────

export interface AuthenticationSettingDef {
  name: string;
  displayName: string;
  authenticationKind: AuthenticationKind;
  managedIdentityName: string;
}

// ─── Health Model ───────────────────────────────────────────────────

export interface HealthModelDef {
  name: string;
  location: string;
  identityType: 'UserAssigned' | 'SystemAssigned';
  userAssignedIdentities?: string[];
}

// ─── Optional Entity Group (generic conditional feature) ────────

/** How signals bind to a data source in an entity */
export interface AzureResourceBinding {
  readonly type: 'azureResource';
  /** Bicep expression for the resource ID (e.g. 'storageAccountId' or 'stamp.aksClusterId') */
  readonly resourceIdExpr: string;
  readonly signals: readonly SignalDef[];
}

export interface AzureMonitorWorkspaceBinding {
  readonly type: 'azureMonitorWorkspace';
  /** Bicep expression for the AMW resource ID */
  readonly resourceIdExpr: string;
  readonly signals: readonly PrometheusSignalDef[];
}

export type SignalBinding = AzureResourceBinding | AzureMonitorWorkspaceBinding;

/** Whether the entity is created once globally or once per stamp */
export type EntityScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'perStamp' };

/** A conditional entity group that can be toggled on/off via a Bicep bool param */
export interface OptionalEntityGroup {
  /** Unique key, e.g. 'queues', 'ai'. Used for Bicep symbolic names and guid seeds. */
  readonly key: string;
  /** Display name for the entity */
  readonly displayName: string;
  /** Bicep bool param that enables this group */
  readonly enableParam: string;
  readonly enableDescription: string;
  /** Which category entity to attach to */
  readonly parentKey: 'root' | 'failures' | 'latency';
  readonly icon: string;
  readonly scope: EntityScope;
  /** One or more signal bindings. Each becomes a signal group on the entity. */
  readonly bindings: readonly SignalBinding[];
  /** Additional Bicep params this group needs (e.g. resource ID params) */
  readonly params: readonly BicepParamDef[];
}

/** A Bicep parameter definition as pure data */
export interface BicepParamDef {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly defaultValue?: string;
}

// ─── Config Types (shared with Grafana) ─────────────────────────────

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
  queueNames?: string[];
}

export interface ResourceConfig {
  cosmosAccount: string;
  frontDoorProfile: string;
  aiServicesAccount: string;
  storageAccount?: string;
}

export interface PlatformConfig {
  subscription: string;
  globalResourceGroup: string;
  domainName: string;
  resources: ResourceConfig;
  stamps: StampConfig[];
  apps: AppConfig[];
}
