import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphEdge, GraphSnapshot } from '../types';
import {
  inferNodeGroup,
  type NodeGroup,
} from '../topologyStudio';

type Impact = GraphEdge['impact'];

interface Props {
  graph: GraphSnapshot;
  selectedTenant: string | null;
}

interface ImpactPalette {
  stroke: string;
  badgeClass: string;
  dotClass: string;
  handleClass: string;
  selectedClass: string;
  legendClass: string;
}

interface GroupPalette {
  badgeClass: string;
}

interface ComponentNodeData extends Record<string, unknown> {
  label: string;
  group: NodeGroup;
  impact: Impact;
  incomingCount: number;
  outgoingCount: number;
  layer: number;
  role: string;
  description: string;
  parents: string[];
  children: string[];
}

type FlowNode = Node<ComponentNodeData, 'dependency'>;

interface GroupSummary {
  group: NodeGroup;
  count: number;
}

interface FlowModel {
  nodes: FlowNode[];
  edges: Edge[];
  roots: string[];
  groups: GroupSummary[];
  maxDepth: number;
  focusNodeId: string | null;
  summary: string;
  sharedDependencies: number;
}

const impactRank: Record<Impact, number> = {
  None: 0,
  Partial: 1,
  Full: 2,
};

const impactPalettes: Record<Impact, ImpactPalette> = {
  None: {
    stroke: '#64748b',
    badgeClass: 'border border-slate-400/20 bg-slate-400/10 text-slate-200',
    dotClass: 'bg-slate-400',
    handleClass: 'bg-slate-400',
    selectedClass: 'border-slate-300/40 shadow-[0_0_0_1px_rgba(148,163,184,0.3),0_24px_50px_rgba(2,6,23,0.34)]',
    legendClass: 'text-slate-300',
  },
  Partial: {
    stroke: '#f59e0b',
    badgeClass: 'border border-amber-300/20 bg-amber-400/12 text-amber-100',
    dotClass: 'bg-amber-400',
    handleClass: 'bg-amber-400',
    selectedClass: 'border-amber-300/40 shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_24px_50px_rgba(2,6,23,0.34)]',
    legendClass: 'text-amber-300',
  },
  Full: {
    stroke: '#34d399',
    badgeClass: 'border border-emerald-300/20 bg-emerald-400/12 text-emerald-100',
    dotClass: 'bg-emerald-400',
    handleClass: 'bg-emerald-400',
    selectedClass: 'border-emerald-300/40 shadow-[0_0_0_1px_rgba(52,211,153,0.34),0_24px_50px_rgba(2,6,23,0.34)]',
    legendClass: 'text-emerald-300',
  },
};

const groupPalettes: Record<NodeGroup, GroupPalette> = {
  Experience: {
    badgeClass: 'border border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
  },
  Core: {
    badgeClass: 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  },
  Data: {
    badgeClass: 'border border-violet-300/20 bg-violet-400/10 text-violet-100',
  },
  Messaging: {
    badgeClass: 'border border-amber-300/20 bg-amber-400/10 text-amber-100',
  },
  Operations: {
    badgeClass: 'border border-pink-300/20 bg-pink-400/10 text-pink-100',
  },
};

const groupOrder: NodeGroup[] = ['Experience', 'Core', 'Data', 'Messaging', 'Operations'];
const HORIZONTAL_GAP = 276;
const VERTICAL_GAP = 176;

function strongestImpact(left: Impact, right: Impact): Impact {
  return impactRank[left] >= impactRank[right] ? left : right;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRole(incomingCount: number, outgoingCount: number, group: NodeGroup): string {
  if (incomingCount === 0) {
    return 'Entry service';
  }

  if (outgoingCount === 0) {
    return `Terminal ${group.toLowerCase()} dependency`;
  }

  if (incomingCount > 1) {
    return 'Shared dependency';
  }

  if (outgoingCount > 1) {
    return 'Fan-out hub';
  }

  return 'Transit service';
}

function buildDescription(
  name: string,
  role: string,
  layer: number,
  incomingCount: number,
  outgoingCount: number,
  impact: Impact,
): string {
  if (incomingCount === 0) {
    return `${name} is an entry point at the top of the tree. Downstream edges show where the request branches next.`;
  }

  if (outgoingCount === 0) {
    return `${name} is a terminal dependency on lane ${layer + 1}, with ${incomingCount} upstream handoff${incomingCount === 1 ? '' : 's'}.`;
  }

  if (role === 'Shared dependency') {
    return `${name} is reused by ${incomingCount} upstream path${incomingCount === 1 ? '' : 's'}, which makes it a good place to check for shared bottlenecks.`;
  }

  if (impact === 'Full') {
    return `${name} sits on a full-impact path and fans out to ${outgoingCount} downstream branch${outgoingCount === 1 ? '' : 'es'}.`;
  }

  return `${name} connects ${incomingCount} upstream and ${outgoingCount} downstream node${outgoingCount === 1 ? '' : 's'} in the main flow.`;
}

function DependencyNode({ data, selected }: NodeProps<FlowNode>) {
  const impactPalette = impactPalettes[data.impact];
  const groupPalette = groupPalettes[data.group];

  return (
    <div
      className={[
        'w-55 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] px-4 py-3 text-left shadow-[0_18px_44px_rgba(2,6,23,0.28)] transition-all duration-200',
        selected ? impactPalette.selectedClass : 'hover:border-white/16',
      ].join(' ')}
      data-impact={data.impact}
      data-group={data.group}
      data-node-label={data.label}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={[
          'h-3! w-3! border-2! border-slate-950!',
          impactPalette.handleClass,
        ].join(' ')}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={['h-2.5 w-2.5 rounded-full', impactPalette.dotClass].join(' ')} />
            <div className="truncate text-[15px] font-semibold tracking-tight text-white">{data.label}</div>
          </div>
          <div className="mt-1 text-xs text-slate-400">{data.role}</div>
        </div>

        <span
          className={[
            'rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]',
            groupPalette.badgeClass,
          ].join(' ')}
        >
          {data.group}
        </span>
      </div>

      <div className="mt-3 h-px bg-white/8" />

      <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
        <span>{data.incomingCount} upstream</span>
        <span>{data.outgoingCount} downstream</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={['rounded-full px-2.5 py-1 text-[11px] font-medium', impactPalette.badgeClass].join(' ')}>
          {data.impact} impact
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">L{data.layer + 1}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={[
          'h-3! w-3! border-2! border-slate-950!',
          impactPalette.handleClass,
        ].join(' ')}
      />
    </div>
  );
}

const nodeTypes = {
  dependency: DependencyNode,
};

function buildFlow(graph: GraphSnapshot): FlowModel {
  const nodeNames = Array.from(
    new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]).concat(graph.nodes)),
  ).sort((left, right) => left.localeCompare(right));

  if (nodeNames.length === 0) {
    return {
      nodes: [],
      edges: [],
      roots: [],
      groups: [],
      maxDepth: 0,
      focusNodeId: null,
      summary: 'Select or seed a tenant to draw the live dependency tree.',
      sharedDependencies: 0,
    };
  }

  const adjacency = new Map<string, string[]>(nodeNames.map((name) => [name, []]));
  const reverseAdjacency = new Map<string, string[]>(nodeNames.map((name) => [name, []]));
  const incomingCount = new Map<string, number>(nodeNames.map((name) => [name, 0]));
  const outgoingCount = new Map<string, number>(nodeNames.map((name) => [name, 0]));
  const nodeImpact = new Map<string, Impact>(nodeNames.map((name) => [name, 'None']));

  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
    reverseAdjacency.get(edge.target)?.push(edge.source);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    nodeImpact.set(edge.source, strongestImpact(nodeImpact.get(edge.source) ?? 'None', edge.impact));
    nodeImpact.set(edge.target, strongestImpact(nodeImpact.get(edge.target) ?? 'None', edge.impact));
  }

  const roots = nodeNames.filter((name) => (incomingCount.get(name) ?? 0) === 0);
  const traversalRoots = roots.length > 0 ? roots : nodeNames.slice(0, 1);
  const queue = [...traversalRoots];
  const layer = new Map<string, number>(traversalRoots.map((name) => [name, 0]));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const currentLayer = layer.get(current) ?? 0;
    for (const child of adjacency.get(current) ?? []) {
      const nextLayer = currentLayer + 1;
      const previousLayer = layer.get(child);

      if (previousLayer === undefined || nextLayer > previousLayer) {
        layer.set(child, nextLayer);
        queue.push(child);
      }
    }
  }

  for (const name of nodeNames) {
    if (!layer.has(name)) {
      const parentLayers = (reverseAdjacency.get(name) ?? []).map((parent) => layer.get(parent) ?? 0);
      layer.set(name, parentLayers.length > 0 ? Math.max(...parentLayers) + 1 : 0);
    }
  }

  const maxDepth = Math.max(0, ...nodeNames.map((name) => layer.get(name) ?? 0));
  const layers = new Map<number, string[]>();

  for (const name of nodeNames) {
    const depth = layer.get(name) ?? 0;
    layers.set(depth, [...(layers.get(depth) ?? []), name]);
  }

  const layerIndex = new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const names = [...(layers.get(depth) ?? [])];
    const orderedNames = depth === 0
      ? names.sort((left, right) => left.localeCompare(right))
      : names.sort((left, right) => {
        const leftParents = reverseAdjacency.get(left) ?? [];
        const rightParents = reverseAdjacency.get(right) ?? [];
        const leftScore = average(leftParents.map((parent) => layerIndex.get(parent) ?? 0));
        const rightScore = average(rightParents.map((parent) => layerIndex.get(parent) ?? 0));

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        const leftGroup = groupOrder.indexOf(inferNodeGroup(left));
        const rightGroup = groupOrder.indexOf(inferNodeGroup(right));
        if (leftGroup !== rightGroup) {
          return leftGroup - rightGroup;
        }

        return left.localeCompare(right);
      });

    orderedNames.forEach((name, index) => {
      layerIndex.set(name, index);
      positions.set(name, {
        x: (index - ((orderedNames.length - 1) / 2)) * HORIZONTAL_GAP,
        y: depth * VERTICAL_GAP,
      });
    });
  }

  const nodes: FlowNode[] = nodeNames.map((name) => {
    const group = inferNodeGroup(name);
    const incoming = incomingCount.get(name) ?? 0;
    const outgoing = outgoingCount.get(name) ?? 0;
    const impact = nodeImpact.get(name) ?? 'None';
    const role = buildRole(incoming, outgoing, group);

    return {
      id: name,
      type: 'dependency',
      position: positions.get(name) ?? { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
      selectable: true,
      data: {
        label: name,
        group,
        impact,
        incomingCount: incoming,
        outgoingCount: outgoing,
        layer: layer.get(name) ?? 0,
        role,
        description: buildDescription(name, role, layer.get(name) ?? 0, incoming, outgoing, impact),
        parents: [...(reverseAdjacency.get(name) ?? [])].sort((left, right) => left.localeCompare(right)),
        children: [...(adjacency.get(name) ?? [])].sort((left, right) => left.localeCompare(right)),
      },
    };
  });

  const edges: Edge[] = graph.edges.map((edge, index) => {
    const palette = impactPalettes[edge.impact];

    return {
      id: `${edge.source}->${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: palette.stroke,
        width: 18,
        height: 18,
      },
      style: {
        stroke: palette.stroke,
        strokeWidth: edge.impact === 'Full' ? 2.8 : edge.impact === 'Partial' ? 2.2 : 1.6,
      },
      animated: edge.impact === 'Full',
    };
  });

  const groups = groupOrder
    .map((group) => ({
      group,
      count: nodeNames.filter((name) => inferNodeGroup(name) === group).length,
    }))
    .filter((entry) => entry.count > 0);

  const sharedDependencies = nodeNames.filter((name) => (incomingCount.get(name) ?? 0) > 1).length;
  const focusNodeId = nodes
    .slice()
    .sort((left, right) => {
      const impactDelta = impactRank[right.data.impact] - impactRank[left.data.impact];
      if (impactDelta !== 0) {
        return impactDelta;
      }

      const rightDegree = right.data.incomingCount + right.data.outgoingCount;
      const leftDegree = left.data.incomingCount + left.data.outgoingCount;
      if (rightDegree !== leftDegree) {
        return rightDegree - leftDegree;
      }

      return left.data.layer - right.data.layer;
    })[0]?.id ?? null;

  const summary = sharedDependencies > 0
    ? 'Top-down layout keeps entry services at the top and shared infrastructure lower in the tree, so bottlenecks stand out earlier.'
    : 'Top-down layout keeps the main request path centered so downstream services are easier to follow.';

  return {
    nodes,
    edges,
    roots: traversalRoots,
    groups,
    maxDepth,
    focusNodeId,
    summary,
    sharedDependencies,
  };
}

function renderNodeList(items: string[]) {
  if (items.length === 0) {
    return <span className="text-sm text-slate-500">None</span>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function GraphView({ graph, selectedTenant }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const flow = useMemo(() => buildFlow(graph), [graph]);

  useEffect(() => {
    setSelectedNodeId(flow.focusNodeId);
  }, [flow.focusNodeId]);

  const selectedNode = flow.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const hasLiveTopology = flow.nodes.length > 0;
  const sourceLabel = selectedTenant ? `Live tenant: ${selectedTenant}` : 'Live topology';

  return (
    <div
      className="flex h-full min-h-215 flex-col gap-5"
      data-testid="topology-studio"
      data-view-variant="atlas"
      data-source-mode="live"
    >
      <section className="rounded-[30px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Live topology</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Live dependency tree
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              A single top-down map of the active tenant. Entry services stay at the top, shared dependencies settle lower, and the selected node explains why it matters.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4" data-testid="graph-summary-cards">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Nodes</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.nodes.length}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Links</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.edges.length}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Entry points</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.roots.length || 1}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Shared deps</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.sharedDependencies}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-h-155 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.42)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.1),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_28%)]" />

          <div className="relative z-10 flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Canvas</div>
              <div className="mt-1 text-sm font-semibold text-white">{sourceLabel}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(['None', 'Partial', 'Full'] as Impact[]).map((impact) => (
                <span
                  key={impact}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                >
                  <span className={impactPalettes[impact].legendClass}>{impact}</span>
                </span>
              ))}
            </div>
          </div>

          {!hasLiveTopology && (
            <div className="absolute inset-x-6 top-24 z-20 rounded-3xl border border-dashed border-white/10 bg-slate-950/84 px-5 py-8 text-center shadow-[0_18px_60px_rgba(2,6,23,0.24)]">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">No live topology</div>
              <div className="mt-3 text-lg font-semibold text-white">Seed or send events to build the tree</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Once the selected tenant has live graph data, this view will pin entry services at the top and stack shared infrastructure lower in the map.
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 top-18.25 z-10" data-testid="graph-canvas">
            <ReactFlow
              key={`${selectedTenant ?? 'live'}-${graph.modelId}-${graph.edges.length}`}
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.35}
              defaultEdgeOptions={{ zIndex: 0 }}
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
              onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            >
              <Panel position="top-left">
                <div className="rounded-2xl border border-white/10 bg-slate-950/84 px-4 py-3 shadow-[0_16px_40px_rgba(2,6,23,0.3)] backdrop-blur">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Tree summary</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {flow.maxDepth + 1} lanes from entry to terminal dependency
                  </div>
                </div>
              </Panel>

              <Panel position="bottom-left">
                <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-950/82 px-4 py-3 text-xs leading-5 text-slate-300 backdrop-blur">
                  {flow.summary}
                </div>
              </Panel>

              <Background
                variant={BackgroundVariant.Dots}
                gap={26}
                size={1.1}
                color="rgba(148, 163, 184, 0.12)"
              />
              <Controls
                className="rounded-2xl! border! border-white/10! bg-slate-950/85! shadow-none!"
                showInteractive={false}
              />
            </ReactFlow>
          </div>
        </div>

        <aside className="flex flex-col gap-4" data-testid="comparison-sidebar">
          <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Reading guide</div>
            <h3 className="mt-2 text-xl font-semibold text-white">How to read this</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Start at the top row for entry services, then read downward. Nodes that collect multiple incoming links are shared dependencies and usually deserve the most scrutiny.
            </p>

            <div className="mt-4 grid gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Top rows</div>
                <div className="mt-2 text-sm text-slate-200">Entry services and early fan-out hubs</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Middle rows</div>
                <div className="mt-2 text-sm text-slate-200">Transit services where handoffs and branching happen</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Lower rows</div>
                <div className="mt-2 text-sm text-slate-200">Shared infrastructure and terminal dependencies</div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur-xl" data-testid="group-summary-panel">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Domain groups</div>
                <h3 className="mt-2 text-xl font-semibold text-white">Group distribution</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                {flow.groups.reduce((sum, entry) => sum + entry.count, 0)} nodes
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {flow.groups.map((entry) => (
                <span
                  key={entry.group}
                  className={[
                    'rounded-full px-3 py-2 text-sm',
                    groupPalettes[entry.group].badgeClass,
                  ].join(' ')}
                >
                  {entry.group} · {entry.count}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/4 p-4 text-sm leading-6 text-slate-300">
              {flow.sharedDependencies > 0
                ? `${flow.sharedDependencies} shared dependenc${flow.sharedDependencies === 1 ? 'y is' : 'ies are'} fed by more than one upstream path.`
                : 'No shared dependencies yet. The current tree mostly behaves like a straight chain.'}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur-xl" data-testid="selected-node-panel">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Selected node</div>
            {selectedNode ? (
              <>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{selectedNode.data.label}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={['rounded-full px-2.5 py-1 text-xs', groupPalettes[selectedNode.data.group].badgeClass].join(' ')}>
                        {selectedNode.data.group}
                      </span>
                      <span className={['rounded-full px-2.5 py-1 text-xs font-medium', impactPalettes[selectedNode.data.impact].badgeClass].join(' ')}>
                        {selectedNode.data.impact} impact
                      </span>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                    lane {selectedNode.data.layer + 1}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300">{selectedNode.data.description}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Role</div>
                    <div className="mt-2 text-base font-semibold text-white">{selectedNode.data.role}</div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Impact</div>
                    <div className="mt-2 text-base font-semibold text-white">{selectedNode.data.impact} impact</div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Upstream</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedNode.data.incomingCount}</div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Downstream</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedNode.data.outgoingCount}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Upstream services</div>
                  {renderNodeList(selectedNode.data.parents)}
                </div>

                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Downstream services</div>
                  {renderNodeList(selectedNode.data.children)}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-400">Click a node to pin details here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}