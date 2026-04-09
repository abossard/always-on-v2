import { useMemo, useState, useCallback } from 'react';
import type { GraphSnapshot, GraphEdge } from '../types';

const impactColors: Record<string, string> = {
  None: '#6b7280',
  Partial: '#f59e0b',
  Full: '#ef4444',
};

const impactIcons: Record<string, string> = {
  None: '●',
  Partial: '◐',
  Full: '◉',
};

interface TreeNode {
  name: string;
  children: { node: TreeNode; impact: string }[];
}

interface Props { graph: GraphSnapshot; }

function buildTree(nodes: string[], edges: GraphEdge[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  for (const name of nodes) {
    nodeMap.set(name, { name, children: [] });
  }

  const childSet = new Set<string>();
  for (const edge of edges) {
    const parent = nodeMap.get(edge.source);
    const child = nodeMap.get(edge.target);
    if (parent && child) {
      parent.children.push({ node: child, impact: edge.impact });
      childSet.add(edge.target);
    }
  }

  // Roots are nodes that are never a target
  const roots = nodes.filter((n) => !childSet.has(n)).map((n) => nodeMap.get(n)!);
  return roots.length ? roots : nodes.map((n) => nodeMap.get(n)!);
}

function TreeItem({ node, impact, depth }: { node: TreeNode; impact?: string; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <li className="list-none">
      <div
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-800 cursor-pointer select-none"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={hasChildren ? toggle : undefined}
      >
        <span className="w-4 text-center text-xs text-gray-500">
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </span>
        {impact && (
          <span
            style={{ color: impactColors[impact] || '#6b7280' }}
            title={`Impact: ${impact}`}
            className="text-xs"
          >
            {impactIcons[impact] || '●'}
          </span>
        )}
        <span className="text-sm text-gray-200">{node.name}</span>
        {impact && (
          <span className="text-xs ml-1" style={{ color: impactColors[impact] || '#6b7280' }}>
            {impact}
          </span>
        )}
        {hasChildren && (
          <span className="text-xs text-gray-600 ml-auto">{node.children.length}</span>
        )}
      </div>
      {hasChildren && expanded && (
        <ul className="m-0 p-0">
          {node.children.map((child) => (
            <TreeItem
              key={child.node.name}
              node={child.node}
              impact={child.impact}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function GraphView({ graph }: Props) {
  const roots = useMemo(
    () => buildTree(graph.nodes, graph.edges),
    [graph],
  );

  if (!graph.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No graph data. Send relationship events (e.g., component &quot;A/B&quot;) to build the graph.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[400px] overflow-auto p-2">
      <div className="flex items-center gap-4 mb-3 px-2 text-xs text-gray-500">
        <span>
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
        <span className="flex items-center gap-3 ml-auto">
          {Object.entries(impactColors).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1">
              <span style={{ color }}>{impactIcons[label]}</span> {label}
            </span>
          ))}
        </span>
      </div>
      <ul className="m-0 p-0">
        {roots.map((root) => (
          <TreeItem key={root.name} node={root} depth={0} />
        ))}
      </ul>
    </div>
  );
}
