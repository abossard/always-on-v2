import { useMemo } from 'react';
import { ReactFlow, type Node, type Edge, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphSnapshot } from '../types';

const impactColors: Record<string, string> = {
  None: '#6b7280',
  Partial: '#f59e0b',
  Full: '#ef4444',
};

interface Props { graph: GraphSnapshot; }

export function GraphView({ graph }: Props) {
  const { nodes, edges } = useMemo(() => {
    if (!graph.nodes.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(graph.nodes.length));
    const rfNodes: Node[] = graph.nodes.map((name, i) => ({
      id: name,
      data: { label: name },
      position: { x: (i % cols) * 200, y: Math.floor(i / cols) * 120 },
      style: {
        background: '#1f2937',
        color: '#e5e7eb',
        border: '1px solid #374151',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: '14px',
      },
    }));

    const rfEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: e.impact === 'Full',
      style: { stroke: impactColors[e.impact] || '#6b7280', strokeWidth: 2 },
      label: e.impact,
      labelStyle: { fill: impactColors[e.impact] || '#6b7280', fontSize: 11 },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [graph]);

  if (!graph.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No graph data. Send relationship events (e.g., component &quot;A/B&quot;) to build the graph.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[400px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
