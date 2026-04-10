import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
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
  shellClass: string;
  iconClass: string;
  iconSurfaceClass: string;
  badgeClass: string;
  handleClass: string;
  selectedClass: string;
  idleClass: string;
  legendClass: string;
}

interface GroupPalette {
  chipClass: string;
  accentClass: string;
}

interface ComponentNodeData {
  label: string;
  accent: Impact;
  incomingCount: number;
  outgoingCount: number;
  isRoot: boolean;
  group: NodeGroup;
  layer: number;
  descriptor: string;
  note: string;
  animationSlot: number;
}

type FlowNode = Node<ComponentNodeData & Record<string, unknown>, 'dependency'>;

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
}

const impactPalettes: Record<Impact, ImpactPalette> = {
  None: {
    stroke: '#94a3b8',
    shellClass: 'border-slate-400/38 bg-[linear-gradient(155deg,rgba(30,41,59,0.92),rgba(2,6,23,0.98))]',
    iconClass: 'text-slate-300',
    iconSurfaceClass: 'border-slate-400/24 bg-slate-400/10',
    badgeClass: 'bg-slate-400/12 text-slate-200',
    handleClass: 'bg-slate-400',
    selectedClass: 'shadow-[0_0_0_1px_#94a3b8,0_26px_70px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_20px_44px_rgba(2,6,23,0.28),0_0_0_1px_rgba(148,163,184,0.22)]',
    legendClass: 'text-slate-300',
  },
  Partial: {
    stroke: '#f59e0b',
    shellClass: 'border-amber-400/45 bg-[linear-gradient(155deg,rgba(120,53,15,0.9),rgba(2,6,23,0.98))]',
    iconClass: 'text-amber-200',
    iconSurfaceClass: 'border-amber-300/28 bg-amber-400/12',
    badgeClass: 'bg-amber-400/14 text-amber-100',
    handleClass: 'bg-amber-500',
    selectedClass: 'shadow-[0_0_0_1px_#f59e0b,0_26px_70px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_20px_44px_rgba(2,6,23,0.28),0_0_0_1px_rgba(245,158,11,0.22)]',
    legendClass: 'text-amber-300',
  },
  Full: {
    stroke: '#fb7185',
    shellClass: 'border-rose-400/48 bg-[linear-gradient(155deg,rgba(127,29,29,0.9),rgba(2,6,23,0.98))]',
    iconClass: 'text-rose-200',
    iconSurfaceClass: 'border-rose-300/28 bg-rose-400/12',
    badgeClass: 'bg-rose-400/14 text-rose-100',
    handleClass: 'bg-rose-500',
    selectedClass: 'shadow-[0_0_0_1px_#fb7185,0_26px_70px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_20px_44px_rgba(2,6,23,0.28),0_0_0_1px_rgba(251,113,133,0.22)]',
    legendClass: 'text-rose-300',
  },
};

const groupPalettes: Record<NodeGroup, GroupPalette> = {
  Experience: {
    chipClass: 'border-cyan-300/25 bg-cyan-400/12 text-cyan-100',
    accentClass: 'text-cyan-300',
  },
  Core: {
    chipClass: 'border-emerald-300/25 bg-emerald-400/12 text-emerald-100',
    accentClass: 'text-emerald-300',
  },
  Data: {
    chipClass: 'border-violet-300/25 bg-violet-400/12 text-violet-100',
    accentClass: 'text-violet-300',
  },
  Messaging: {
    chipClass: 'border-amber-300/25 bg-amber-400/12 text-amber-100',
    accentClass: 'text-amber-300',
  },
  Operations: {
    chipClass: 'border-pink-300/25 bg-pink-400/12 text-pink-100',
    accentClass: 'text-pink-300',
  },
};

const impactIcons: Record<Impact, string> = {
  None: '●',
  Partial: '◐',
  Full: '◉',
};

const impactRank: Record<Impact, number> = {
  None: 0,
  Partial: 1,
  Full: 2,
};

const groupOrder: NodeGroup[] = ['Experience', 'Core', 'Data', 'Messaging', 'Operations'];
const NODE_WIDTH = 208;
const ORBIT_ROOT_RADIUS = 132;
const ORBIT_DEPTH_GAP = 336;
const ORBIT_ARC_SPACING = NODE_WIDTH + 92;

function strongestImpact(left: Impact, right: Impact): Impact {
  return impactRank[left] >= impactRank[right] ? left : right;
}

function buildDescriptor(group: NodeGroup, incomingCount: number, outgoingCount: number, isRoot: boolean, accent: Impact) {
  if (isRoot) {
    return 'Entry path';
  }

  if (outgoingCount === 0) {
    return `Terminal ${group.toLowerCase()} node`;
  }

  if (accent === 'Full') {
    return 'High blast radius';
  }

  return `${incomingCount} in / ${outgoingCount} out`;
}

function DependencyNode({ data, selected }: NodeProps<FlowNode>) {
  const palette = impactPalettes[data.accent];
  const groupPalette = groupPalettes[data.group];

  return (
    <div
      className={[
        'topology-node-shell w-52 rounded-[22px] border px-3 py-2.5 text-left backdrop-blur-xl transition-all duration-200',
        `topology-node-delay-${data.animationSlot}`,
        palette.shellClass,
        selected ? `${palette.selectedClass} -translate-y-1` : palette.idleClass,
      ].join(' ')}
      data-impact={data.accent}
      data-group={data.group}
      data-node-label={data.label}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={['h-3! w-3! border-2! border-slate-950!', palette.handleClass].join(' ')}
      />

      <div className="flex items-start gap-2">
        <div
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold',
            palette.iconClass,
            palette.iconSurfaceClass,
          ].join(' ')}
        >
          {impactIcons[data.accent]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="wrap-break-word text-[13px] font-semibold leading-5 tracking-tight text-white">{data.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] uppercase tracking-[0.22em] text-slate-400">
            <span className={['rounded-full border px-1.5 py-0.5 text-[8px]', groupPalette.chipClass].join(' ')}>
              {data.group}
            </span>
            <span>{data.isRoot ? 'Entry point' : `Depth ${data.layer + 1}`}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[11px] font-medium leading-4 text-slate-300/90">
        {data.descriptor}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[9px] text-slate-200">
        <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5">
          {data.incomingCount} in
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5">
          {data.outgoingCount} out
        </span>
        <span className={['ml-auto rounded-full px-1.5 py-0.5 font-medium', palette.badgeClass].join(' ')}>
          {data.accent}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={['h-3! w-3! border-2! border-slate-950!', palette.handleClass].join(' ')}
      />
    </div>
  );
}

const nodeTypes = {
  dependency: DependencyNode,
};

function buildNote(name: string, group: NodeGroup, incomingCount: number, outgoingCount: number, isRoot: boolean, accent: Impact) {
  if (isRoot) {
    return `${name} is an entry node. This is where the current tree starts before fanning out downstream.`;
  }

  if (outgoingCount === 0) {
    return `${name} is a terminal ${group.toLowerCase()} dependency receiving ${incomingCount} upstream handoff${incomingCount === 1 ? '' : 's'}.`;
  }

  if (accent === 'Full') {
    return `${name} sits on a full-impact path, so changes here propagate strongly through ${outgoingCount} downstream edge${outgoingCount === 1 ? '' : 's'}.`;
  }

  return `${name} coordinates ${group.toLowerCase()} work between ${incomingCount} upstream and ${outgoingCount} downstream connection${outgoingCount === 1 ? '' : 's'}.`;
}

function buildFlow(graph: GraphSnapshot): FlowModel {
  const nodeNames = Array.from(
    new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]).concat(graph.nodes)),
  );

  const adjacency = new Map<string, GraphEdge[]>(nodeNames.map((name) => [name, []]));
  const incomingCount = new Map<string, number>(nodeNames.map((name) => [name, 0]));
  const outgoingCount = new Map<string, number>(nodeNames.map((name) => [name, 0]));
  const nodeAccent = new Map<string, Impact>(nodeNames.map((name) => [name, 'None']));

  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    nodeAccent.set(edge.source, strongestImpact(nodeAccent.get(edge.source) ?? 'None', edge.impact));
    nodeAccent.set(edge.target, strongestImpact(nodeAccent.get(edge.target) ?? 'None', edge.impact));
  }

  const roots = nodeNames.filter((name) => (incomingCount.get(name) ?? 0) === 0);
  const queue = roots.length > 0 ? [...roots] : nodeNames.slice(0, 1);
  const layer = new Map<string, number>(queue.map((name) => [name, 0]));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const nextLayer = (layer.get(current) ?? 0) + 1;
    for (const edge of adjacency.get(current) ?? []) {
      if (!layer.has(edge.target)) {
        layer.set(edge.target, nextLayer);
        queue.push(edge.target);
      }
    }
  }

  for (const name of nodeNames) {
    if (!layer.has(name)) {
      layer.set(name, 0);
    }
  }

  const traversalRoots = roots.length ? [...roots].sort() : nodeNames.slice(0, 1);
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (name: string) => {
    if (visited.has(name)) {
      return;
    }

    visited.add(name);
    ordered.push(name);

    const children = [...(adjacency.get(name) ?? [])].sort((left, right) => {
      const impactDelta = impactRank[right.impact] - impactRank[left.impact];
      if (impactDelta !== 0) {
        return impactDelta;
      }

      return left.target.localeCompare(right.target);
    });

    for (const child of children) {
      visit(child.target);
    }
  };

  for (const root of traversalRoots) {
    visit(root);
  }

  for (const name of [...nodeNames].sort((left, right) => {
    const layerDelta = (layer.get(left) ?? 0) - (layer.get(right) ?? 0);
    if (layerDelta !== 0) {
      return layerDelta;
    }

    return left.localeCompare(right);
  })) {
    visit(name);
  }

  const orbitLayers = new Map<number, string[]>();
  const positions = new Map<string, { x: number; y: number }>();

  for (const name of ordered) {
    const depth = layer.get(name) ?? 0;

    orbitLayers.set(depth, [...(orbitLayers.get(depth) ?? []), name]);
  }

  for (const [depth, names] of [...orbitLayers.entries()].sort((left, right) => left[0] - right[0])) {
    const orderedNames = [...names].sort((left, right) => left.localeCompare(right));
    const minimumRadius = (orderedNames.length * ORBIT_ARC_SPACING) / (2 * Math.PI);
    const radius = depth === 0
      ? ORBIT_ROOT_RADIUS
      : Math.max(depth * ORBIT_DEPTH_GAP, minimumRadius + (depth * 24));

    orderedNames.forEach((name, index) => {
      if (depth === 0 && orderedNames.length === 1) {
        positions.set(name, { x: 0, y: 0 });
        return;
      }

      const angleOffset = orderedNames.length > 1 ? Math.PI / orderedNames.length : 0;
      const angle = (-Math.PI / 2) + angleOffset + ((index / orderedNames.length) * Math.PI * 2);
      positions.set(name, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  }

  const nodes: FlowNode[] = nodeNames.map((name, index) => {
    const group = inferNodeGroup(name);
    const incoming = incomingCount.get(name) ?? 0;
    const outgoing = outgoingCount.get(name) ?? 0;
    const accent = nodeAccent.get(name) ?? 'None';
    const isRoot = incoming === 0;

    return {
      id: name,
      type: 'dependency',
      data: {
        label: name,
        accent,
        incomingCount: incoming,
        outgoingCount: outgoing,
        isRoot,
        group,
        layer: layer.get(name) ?? 0,
        descriptor: buildDescriptor(group, incoming, outgoing, isRoot, accent),
        note: buildNote(name, group, incoming, outgoing, isRoot, accent),
        animationSlot: index % 9,
      },
      position: positions.get(name) ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      selectable: true,
    };
  });

  const edges: Edge[] = graph.edges.map((edge, index) => {
    const palette = impactPalettes[edge.impact];
    return {
      id: `${edge.source}->${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      label: edge.impact,
      labelStyle: {
        fill: '#e2e8f0',
        fontSize: 11,
        fontWeight: 700,
      },
      labelBgPadding: [10, 5],
      labelBgBorderRadius: 999,
      labelBgStyle: {
        fill: 'rgba(2, 6, 23, 0.92)',
        stroke: palette.stroke,
        strokeWidth: 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: palette.stroke,
        width: 18,
        height: 18,
      },
      style: {
        stroke: palette.stroke,
        strokeWidth: edge.impact === 'Full' ? 2.8 : edge.impact === 'Partial' ? 2.3 : 1.5,
      },
      animated: edge.impact !== 'None',
    };
  });

  const groups = groupOrder
    .map((group) => ({ group, count: nodeNames.filter((name) => inferNodeGroup(name) === group).length }))
    .filter((entry) => entry.count > 0);

  const maxDepth = Math.max(0, ...nodeNames.map((name) => layer.get(name) ?? 0));
  const focusNodeId = nodes
    .slice()
    .sort((left, right) => {
      const impactDelta = impactRank[right.data.accent] - impactRank[left.data.accent];
      if (impactDelta !== 0) {
        return impactDelta;
      }

      return (right.data.outgoingCount + right.data.incomingCount) - (left.data.outgoingCount + left.data.incomingCount);
    })[0]?.id ?? null;

  const summary = 'Orbit view spreads each dependency depth across a wider ring so fan-out stays readable as the graph grows.';

  return { nodes, edges, roots, groups, maxDepth, focusNodeId, summary };
}

export function GraphView({ graph, selectedTenant }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const flow = useMemo(() => buildFlow(graph), [graph]);

  useEffect(() => {
    setSelectedNodeId(flow.focusNodeId);
  }, [flow.focusNodeId]);

  const selectedNode = flow.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const hasLiveTopology = graph.edges.length > 0 || graph.nodes.length > 0;
  const sourceLabel = selectedTenant ? `Live tenant: ${selectedTenant}` : 'Live topology';

  return (
    <div className="flex h-full min-h-215 flex-col gap-5" data-testid="topology-studio" data-view-variant="orbit" data-source-mode="live">
      <section className="rounded-4xl border border-white/10 bg-slate-950/72 p-5 shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Live topology</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Orbit view for the active tenant graph
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              The graph now stays on a single orbit layout, with wider rings and lighter nodes so the live dependency shape is easier to scan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3" data-testid="graph-summary-cards">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Roots</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.roots.length || 1}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Depth</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.maxDepth + 1}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Groups</div>
              <div className="mt-2 text-2xl font-semibold text-white">{flow.groups.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[28px] border border-white/10 bg-white/4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/28 bg-emerald-400/12 px-3 py-2 text-xs uppercase tracking-[0.24em] text-emerald-100">
                Orbit layout
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">
                {sourceLabel}
              </span>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-900/65 p-4 text-sm leading-6 text-slate-300">
              Only live graph data is shown here. Use the event tools to send or seed events, then refresh the tenant graph to see the orbit expand.
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/4 p-4">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">View behavior</div>
            <div className="mt-3 text-lg font-semibold text-white">Orbit rings</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Each dependency depth stays on its own ring, which makes fan-out and blast radius easier to read without swapping to a second layout.
            </p>
            <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-900/65 p-4 text-sm leading-6 text-slate-300">
              Wider ring spacing and smaller node cards reduce overlap when the tenant graph grows denser.
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-h-155 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.42)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(251,113,133,0.12),transparent_28%)]" />

          {!hasLiveTopology && (
            <div className="absolute left-5 right-5 top-5 z-20 rounded-3xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              No live topology has been loaded yet. Send or seed events from the event tools, then refresh the tenant graph to populate this orbit.
            </div>
          )}

          <div className="absolute inset-0 z-10 h-full w-full" data-testid="graph-canvas">
            <ReactFlow
              key={`${selectedTenant ?? 'live'}-${graph.modelId}-${graph.edges.length}`}
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.26 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.2}
              defaultEdgeOptions={{ zIndex: 0 }}
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
              onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            >
              <Panel position="top-left">
                <div className="rounded-2xl border border-white/10 bg-slate-950/84 px-4 py-3 shadow-[0_16px_40px_rgba(2,6,23,0.35)] backdrop-blur">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Current view</div>
                  <div className="mt-2 text-sm font-semibold text-white">Orbit rings</div>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-slate-300">{flow.summary}</p>
                </div>
              </Panel>

              <Panel position="bottom-left">
                <div className="rounded-2xl border border-white/10 bg-slate-950/82 px-4 py-3 text-xs text-slate-300 backdrop-blur">
                  <div className="font-semibold text-white">{sourceLabel}</div>
                  <div className="mt-1">Depth stays on dedicated rings to keep hot spots visible.</div>
                </div>
              </Panel>

              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.1}
                color="rgba(148, 163, 184, 0.14)"
              />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(2, 6, 23, 0.72)"
                className="rounded-2xl! border! border-white/10! bg-slate-950/88!"
                nodeColor={(node) => impactPalettes[((node.data as unknown) as ComponentNodeData).accent].stroke}
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
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Orbit note</div>
            <h3 className="mt-2 text-xl font-semibold text-white">Single live layout</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">{flow.summary}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">This panel is focused on the active tenant graph only.</p>
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/4 p-4 text-sm leading-6 text-slate-300">
              {hasLiveTopology
                ? `This is the live graph for ${selectedTenant ?? 'the selected tenant'}. Wider orbit spacing keeps dense downstream branches readable without switching away from the main view.`
                : 'Once the selected tenant has events, the orbit will pin the busiest dependency near focus and spread the rest across depth rings.'}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur-xl" data-testid="group-summary-panel">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Domain groups</div>
                <h3 className="mt-2 text-xl font-semibold text-white">Grouped view hints</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                {flow.groups.reduce((sum, entry) => sum + entry.count, 0)} nodes
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {flow.groups.map((entry) => (
                <span
                  key={entry.group}
                  className={['rounded-full border px-3 py-2 text-sm', groupPalettes[entry.group].chipClass].join(' ')}
                >
                  {entry.group} · {entry.count}
                </span>
              ))}
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
                      <span className={['rounded-full border px-2.5 py-1 text-xs', groupPalettes[selectedNode.data.group].chipClass].join(' ')}>
                        {selectedNode.data.group}
                      </span>
                      <span className={['rounded-full px-2.5 py-1 text-xs font-medium', impactPalettes[selectedNode.data.accent].badgeClass].join(' ')}>
                        {selectedNode.data.accent} impact
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                    depth {selectedNode.data.layer + 1}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300">{selectedNode.data.note}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Incoming</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedNode.data.incomingCount}</div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/4 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Outgoing</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedNode.data.outgoingCount}</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-400">Click a node to pin details here.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Impact legend</div>
            <h3 className="mt-2 text-xl font-semibold text-white">Read the edges quickly</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['None', 'Partial', 'Full'] as Impact[]).map((impact) => (
              <div
                key={impact}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
              >
                <span className={impactPalettes[impact].legendClass}>{impactIcons[impact]}</span>
                <span>{impact}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}