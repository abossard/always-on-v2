import { useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { GraphSnapshot, GraphEdge, MergedProperty } from '../types';

// ── Types ──

interface Props {
  graph: GraphSnapshot;
  selectedTenant: string | null;
  componentPayloads?: Record<string, MergedProperty[]>;
  flashedComponents?: Set<string>;
}

type ViewMode = 'tree' | 'list';

interface InstrumentNodeData extends Record<string, unknown> {
  label: string;
  connections: number;
  properties: MergedProperty[];
  flashed: boolean;
}

// ── Impact colors (hospital-themed) ──

const impactColor: Record<GraphEdge['impact'], string> = {
  Full: '#dc2626',
  Partial: '#d97706',
  None: '#9ca3af',
};

const impactBadge: Record<GraphEdge['impact'], string> = {
  Full: 'border-red-200 bg-red-50 text-red-600',
  Partial: 'border-amber-200 bg-amber-50 text-amber-600',
  None: 'border-gray-200 bg-gray-100 text-gray-500',
};

// ── Custom node ──

function InstrumentNode({ data }: NodeProps<FlowNode<InstrumentNodeData>>) {
  const statusProp = data.properties.find(p => p.name === 'status');
  const statusColor = statusProp?.value === 'warning' ? 'bg-amber-400' : statusProp?.value === 'offline' ? 'bg-red-400' : 'bg-teal-400';

  return (
    <div className={`rounded-lg border px-4 py-2.5 shadow-sm min-w-[160px] max-w-[220px] transition-colors duration-700 ${
      data.flashed ? 'border-green-400 bg-green-100' : 'border-teal-200 bg-white'
    }`}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-teal-400 !border-white" />
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${statusColor} shrink-0`} />
        <span className="text-sm font-semibold text-gray-800 truncate">{data.label}</span>
      </div>
      {data.properties.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {data.properties.slice(0, 3).map(p => (
            <div key={p.name} className="flex justify-between text-[10px]">
              <span className="text-gray-400 truncate mr-1">{p.name}</span>
              <span className="text-gray-600 font-mono truncate">{p.value}</span>
            </div>
          ))}
          {data.properties.length > 3 && (
            <div className="text-[10px] text-gray-400">+{data.properties.length - 3} more</div>
          )}
        </div>
      )}
      {data.connections > 0 && data.properties.length === 0 && (
        <div className="mt-1 text-[11px] text-gray-400">{data.connections} connection{data.connections !== 1 ? 's' : ''}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-teal-400 !border-white" />
    </div>
  );
}

const nodeTypes = { instrument: InstrumentNode };

// ── Layout with dagre ──

function buildTreeLayout(
  graph: GraphSnapshot,
  payloads: Record<string, MergedProperty[]>,
  flashed: Set<string>,
): { nodes: FlowNode<InstrumentNodeData>[]; edges: FlowEdge[] } {
  if (graph.components.length === 0) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  const connectionCount = new Map<string, number>();
  for (const edge of graph.edges) {
    connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1);
    connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1);
  }

  for (const node of graph.components) {
    const props = payloads[node] ?? [];
    const h = props.length > 0 ? 56 + Math.min(props.length, 3) * 14 + 8 : 56;
    g.setNode(node, { width: 190, height: h });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: FlowNode<InstrumentNodeData>[] = graph.components.map((name) => {
    const pos = g.node(name);
    return {
      id: name,
      type: 'instrument',
      position: { x: (pos?.x ?? 0) - 95, y: (pos?.y ?? 0) - 28 },
      data: {
        label: name,
        connections: connectionCount.get(name) ?? 0,
        properties: payloads[name] ?? [],
        flashed: flashed.has(name),
      },
    };
  });

  const edges: FlowEdge[] = graph.edges.map((edge, i) => ({
    id: `e-${edge.source}-${edge.target}-${i}`,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: impactColor[edge.impact], width: 16, height: 16 },
    style: {
      stroke: impactColor[edge.impact],
      strokeWidth: edge.impact === 'Full' ? 2.5 : edge.impact === 'Partial' ? 2 : 1.5,
    },
    animated: edge.impact === 'Full',
  }));

  return { nodes, edges };
}

// ── Component ──

export function GraphView({ graph, selectedTenant, componentPayloads = {}, flashedComponents = new Set() }: Props) {
  const hasModel = graph.components.length > 0;
  const [view, setView] = useState<ViewMode>('tree');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const treeData = useMemo(() => buildTreeLayout(graph, componentPayloads, flashedComponents), [graph, componentPayloads, flashedComponents]);

  const selectedProps = selectedNode ? (componentPayloads[selectedNode] ?? []) : [];

  return (
    <div className="flex h-full flex-col gap-4" data-testid="graph-view">
      {/* Title bar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-teal-800">
            {selectedTenant ? `🩺 Instruments — ${selectedTenant}` : '🩺 Select a ward'}
          </h2>
          {selectedTenant && (
            <p className="mt-0.5 text-sm text-gray-500" data-testid="current-model-id">
              Model: {graph.modelId || '—'}
            </p>
          )}
        </div>
        {selectedTenant && hasModel && (
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" data-testid="view-switcher">
            <button onClick={() => setView('tree')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'tree' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              🌳 Tree
            </button>
            <button onClick={() => setView('list')} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'list' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              📋 List
            </button>
          </div>
        )}
      </div>

      {/* Empty: no tenant selected */}
      {!selectedTenant && (
        <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-10" data-testid="empty-state">
          <div className="text-center">
            <span className="text-4xl">🏥</span>
            <p className="mt-3 text-sm text-gray-500">Choose a ward or tenant to view the current instrument model.</p>
          </div>
        </div>
      )}

      {/* Empty: tenant selected, no model yet */}
      {selectedTenant && !hasModel && (
        <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-10" data-testid="empty-model">
          <div className="text-center">
            <span className="text-4xl">📡</span>
            <p className="mt-3 text-sm text-gray-500">No instruments in this ward yet. Send events to populate the model.</p>
          </div>
        </div>
      )}

      {/* Model present */}
      {selectedTenant && hasModel && (
        <div className="flex flex-1 flex-col gap-4" data-testid="current-model">
          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-teal-600">Instruments</div>
              <div className="mt-1 text-2xl font-bold text-teal-800" data-testid="instrument-count">{graph.components.length}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-blue-600">Connections</div>
              <div className="mt-1 text-2xl font-bold text-blue-800" data-testid="connection-count">{graph.edges.length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Model</div>
              <div className="mt-1 text-sm font-semibold text-gray-700 truncate">{graph.modelId}</div>
            </div>
          </div>

          <div className="flex flex-1 gap-4">
            {/* Tree view */}
            {view === 'tree' && (
              <div className="relative flex-1 rounded-xl border border-gray-200 bg-white shadow-sm" style={{ height: 500 }} data-testid="tree-view">
                <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                  {(['Full', 'Partial', 'None'] as const).map((imp) => (
                    <span key={imp} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${impactBadge[imp]}`}>{imp}</span>
                  ))}
                </div>
                <ReactFlow
                  nodes={treeData.nodes}
                  edges={treeData.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.25 }}
                  nodesDraggable
                  nodesConnectable={false}
                  elementsSelectable
                  minZoom={0.3}
                  maxZoom={2}
                  defaultEdgeOptions={{ zIndex: 0 }}
                  proOptions={{ hideAttribution: true }}
                  onNodeClick={(_, node) => setSelectedNode(node.id)}
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
                  <Controls className="!rounded-lg !border !border-gray-200 !bg-white !shadow-sm" showInteractive={false} />
                </ReactFlow>
              </div>
            )}

            {/* List view */}
            {view === 'list' && (
              <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm overflow-auto">
                <h3 className="mb-3 text-sm font-semibold text-teal-700">Instruments</h3>
                <ul className="space-y-1.5" data-testid="instrument-list">
                  {graph.components.map((node) => {
                    const props = componentPayloads[node] ?? [];
                    const isFlashed = flashedComponents.has(node);
                    return (
                      <li key={node}
                        className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors duration-700 ${
                          isFlashed ? 'border-green-400 bg-green-100' :
                          selectedNode === node ? 'border-teal-300 bg-teal-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                        }`}
                        data-testid="instrument-item"
                        onClick={() => setSelectedNode(node)}
                      >
                        <div className="flex items-center gap-2 text-gray-700">
                          <span className="h-2 w-2 rounded-full bg-teal-400" />
                          <span className="font-medium">{node}</span>
                          {props.length > 0 && <span className="ml-auto text-[11px] text-gray-400">{props.length} props</span>}
                        </div>
                        {props.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5" data-testid="inline-props">
                            {props.slice(0, 4).map(p => (
                              <span key={p.name} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 font-mono">
                                {p.name}={p.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {graph.edges.length > 0 && (
                  <>
                    <h3 className="mb-3 mt-6 text-sm font-semibold text-blue-700">Connections</h3>
                    <ul className="space-y-1.5" data-testid="connection-list">
                      {graph.edges.map((edge, i) => (
                        <li key={`${edge.source}-${edge.target}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          <span className="font-medium">{edge.source}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-medium">{edge.target}</span>
                          <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium ${impactBadge[edge.impact]}`}>{edge.impact}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Selected node detail panel */}
            {selectedNode && selectedProps.length > 0 && (
              <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-auto" style={{ maxHeight: 500 }} data-testid="payload-panel">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-teal-700">{selectedNode}</h3>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                </div>
                <table className="w-full text-xs" data-testid="payload-table">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-gray-400">
                      <th className="pb-1.5">Property</th>
                      <th className="pb-1.5">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProps.map(p => (
                      <tr key={p.name} className="border-t border-gray-50" data-testid="payload-row">
                        <td className="py-1 text-gray-600">{p.name}</td>
                        <td className="py-1 font-mono text-gray-800">{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
