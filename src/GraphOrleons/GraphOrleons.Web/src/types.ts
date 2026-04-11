export interface HealthEvent {
  tenant: string;
  component: string;
  payload: Record<string, unknown>;
}

export interface MergedProperty {
  name: string;
  value: string;
  lastUpdated: string;
}

export interface ComponentSnapshot {
  name: string;
  totalCount: number;
  lastEffectiveUpdate: string;
  properties: MergedProperty[];
}

export interface GraphEdge {
  source: string;
  target: string;
  impact: 'None' | 'Partial' | 'Full';
}

export interface GraphSnapshot {
  modelId: string;
  components: string[];
  edges: GraphEdge[];
}

export interface ModelsInfo {
  modelIds: string[];
  activeModelId: string | null;
}
