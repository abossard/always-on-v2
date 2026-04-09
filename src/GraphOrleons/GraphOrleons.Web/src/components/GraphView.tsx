import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphEdge, GraphSnapshot } from '../types';

type Impact = GraphEdge['impact'];

interface Props {
  graph: GraphSnapshot;
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

interface ComponentNodeData {
  label: string;
  accent: Impact;
  incomingCount: number;
  outgoingCount: number;
  isRoot: boolean;
}

type FlowNode = Node<ComponentNodeData & Record<string, unknown>, 'dependency'>;

interface FlowModel {
  nodes: FlowNode[];
  edges: Edge[];
  roots: string[];
}

const impactPalettes: Record<Impact, ImpactPalette> = {
  None: {
    stroke: '#94a3b8',
    shellClass: 'border-slate-400/40 bg-[linear-gradient(150deg,rgba(30,41,59,0.88),rgba(2,6,23,0.96))]',
    iconClass: 'text-slate-300',
    iconSurfaceClass: 'border-slate-400/30 bg-slate-400/10',
    badgeClass: 'bg-slate-400/12 text-slate-300',
    handleClass: 'bg-slate-400',
    selectedClass: 'shadow-[0_0_0_1px_#94a3b8,0_24px_60px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_18px_42px_rgba(2,6,23,0.36),0_0_0_1px_rgba(148,163,184,0.25)]',
    legendClass: 'text-slate-300',
  },
  Partial: {
    stroke: '#f59e0b',
    shellClass: 'border-amber-400/45 bg-[linear-gradient(150deg,rgba(120,53,15,0.84),rgba(2,6,23,0.96))]',
    iconClass: 'text-amber-300',
    iconSurfaceClass: 'border-amber-400/35 bg-amber-400/12',
    badgeClass: 'bg-amber-400/14 text-amber-300',
    handleClass: 'bg-amber-500',
    selectedClass: 'shadow-[0_0_0_1px_#f59e0b,0_24px_60px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_18px_42px_rgba(2,6,23,0.36),0_0_0_1px_rgba(245,158,11,0.28)]',
    legendClass: 'text-amber-300',
  },
  Full: {
    stroke: '#f43f5e',
    shellClass: 'border-rose-400/45 bg-[linear-gradient(150deg,rgba(127,29,29,0.84),rgba(2,6,23,0.96))]',
    iconClass: 'text-rose-300',
    iconSurfaceClass: 'border-rose-400/35 bg-rose-400/12',
    badgeClass: 'bg-rose-400/14 text-rose-300',
    handleClass: 'bg-rose-500',
    selectedClass: 'shadow-[0_0_0_1px_#f43f5e,0_24px_60px_rgba(2,6,23,0.45)]',
    idleClass: 'shadow-[0_18px_42px_rgba(2,6,23,0.36),0_0_0_1px_rgba(244,63,94,0.28)]',
    legendClass: 'text-rose-300',
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

function strongestImpact(left: Impact, right: Impact): Impact {
  return impactRank[left] >= impactRank[right] ? left : right;
}

function DependencyNode({ data, selected }: NodeProps<FlowNode>) {
  const palette = impactPalettes[data.accent];

  return (
    <div
      className={[
        'min-w-57.5 rounded-4xl border px-4 py-3 text-left backdrop-blur-xl transition-all duration-200',
        palette.shellClass,
        selected ? `${palette.selectedClass} -translate-y-0.5` : palette.idleClass,
      ].join(' ')}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={['h-3! w-3! border-2! border-slate-950!', palette.handleClass].join(' ')}
      />
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold',
            palette.iconClass,
            palette.iconSurfaceClass,
          ].join(' ')}
        >
          {impactIcons[data.accent]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight text-slate-50">
            {data.label}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {data.isRoot ? 'Entry component' : 'Dependency node'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-300">
        <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1">
          {data.incomingCount} incoming
        </span>
        <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1">
          {data.outgoingCount} downstream
        </span>
        <span
          className={['ml-auto rounded-full px-2.5 py-1 font-medium', palette.badgeClass].join(' ')}
        >
          {data.accent} impact
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

function buildFlow(graph: GraphSnapshot): FlowModel {
  const nodeNames = Array.from(
    new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]).concat(graph.nodes)),
  );

  const adjacency = new Map<string, GraphEdge[]>(
    nodeNames.map((name) => [name, []]),
  );
  const incomingCount = new Map<string, number>(
    nodeNames.map((name) => [name, 0]),
  );
  const outgoingCount = new Map<string, number>(
    nodeNames.map((name) => [name, 0]),
  );
  const nodeAccent = new Map<string, Impact>(
    nodeNames.map((name) => [name, 'None']),
  );

  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    nodeAccent.set(edge.source, strongestImpact(nodeAccent.get(edge.source) ?? 'None', edge.impact));
    nodeAccent.set(edge.target, strongestImpact(nodeAccent.get(edge.target) ?? 'None', edge.impact));
  }

  const roots = nodeNames.filter((name) => (incomingCount.get(name) ?? 0) === 0);
  const layer = new Map<string, number>();
  const queue = roots.length ? [...roots] : nodeNames.slice(0, 1);

  for (const root of queue) {
    layer.set(root, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
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

  const layerGroups = new Map<number, string[]>();
  for (const name of ordered) {
    const group = layerGroups.get(layer.get(name) ?? 0) ?? [];
    group.push(name);
    layerGroups.set(layer.get(name) ?? 0, group);
  }

  const verticalGap = 148;
  const horizontalGap = 320;
  const position = new Map<string, { x: number; y: number }>();

  for (const [depth, names] of [...layerGroups.entries()].sort((left, right) => left[0] - right[0])) {
    const groupHeight = (names.length - 1) * verticalGap;
    names.forEach((name, index) => {
      position.set(name, {
        x: depth * horizontalGap,
        y: index * verticalGap - groupHeight / 2,
      });
    });
  }

  const nodes: FlowNode[] = nodeNames.map((name) => ({
    id: name,
    type: 'dependency',
    data: {
      label: name,
      accent: nodeAccent.get(name) ?? 'None',
      incomingCount: incomingCount.get(name) ?? 0,
      outgoingCount: outgoingCount.get(name) ?? 0,
      isRoot: (incomingCount.get(name) ?? 0) === 0,
    },
    position: position.get(name) ?? { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: false,
  }));

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
        strokeWidth: edge.impact === 'Full' ? 2.8 : edge.impact === 'Partial' ? 2.3 : 1.6,
      },
      animated: edge.impact !== 'None',
    };
  });

  return { nodes, edges, roots };
}

export function GraphView({ graph }: Props) {
  const flow = useMemo(() => buildFlow(graph), [graph]);

  if (!graph.nodes.length && !graph.edges.length) {
    return (
      <div className="flex h-full min-h-130 items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-4xl border border-slate-800/80 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))] p-10 text-center shadow-[0_24px_70px_rgba(2,6,23,0.45)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-2xl text-emerald-300">
            ◌
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-50">
            No topology yet
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Send relationship events such as component paths like &quot;A/B&quot; and this view will turn them
            into a live dependency tree.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-140 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/70 px-5 py-4 shadow-[0_18px_50px_rgba(2,6,23,0.28)] backdrop-blur">
          <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
            Live dependency tree
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
            {graph.modelId || 'Current topology'}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Left-to-right layout with impact-aware connections and root detection.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Nodes</div>
            <div className="mt-2 text-2xl font-semibold text-slate-50">{flow.nodes.length}</div>
          </div>
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Edges</div>
            <div className="mt-2 text-2xl font-semibold text-slate-50">{flow.edges.length}</div>
          </div>
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Roots</div>
            <div className="mt-2 text-2xl font-semibold text-slate-50">{flow.roots.length || 1}</div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2 self-stretch">
          {(['None', 'Partial', 'Full'] as Impact[]).map((impact) => (
            <div
              key={impact}
              className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-300 backdrop-blur"
            >
              <span className={impactPalettes[impact].legendClass}>{impactIcons[impact]}</span>
              <span>{impact}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-4xl border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.48)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.12),transparent_24%)]" />
        <div className="absolute inset-0 z-10 h-full w-full">
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            minZoom={0.35}
            defaultEdgeOptions={{ zIndex: 0 }}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.2}
              color="rgba(148, 163, 184, 0.16)"
            />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(2, 6, 23, 0.7)"
              className="rounded-2xl! border! border-slate-800/80! bg-slate-950/90!"
              nodeColor={(node) => impactPalettes[((node.data as unknown) as ComponentNodeData).accent].stroke}
            />
            <Controls
              className="rounded-2xl! border! border-slate-800/80! bg-slate-950/85! shadow-none!"
              showInteractive={false}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
