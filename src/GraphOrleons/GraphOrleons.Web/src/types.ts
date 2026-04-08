export interface HealthEvent {
  tenant: string;
  component: string;
  payload: Record<string, unknown>;
}

export interface PayloadEntry {
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface ComponentSnapshot {
  name: string;
  latestPayload: Record<string, unknown> | null;
  totalCount: number;
  history: PayloadEntry[];
}

export interface GraphEdge {
  source: string;
  target: string;
  impact: 'None' | 'Partial' | 'Full';
}

export interface GraphSnapshot {
  modelId: string;
  nodes: string[];
  edges: GraphEdge[];
}

export interface ModelsInfo {
  modelIds: string[];
  activeModelId: string | null;
}
