"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import * as api from "@/lib/api";
import { useEventSource } from "@/hooks/useEventSource";
import type {
  AgentInfo,
  WorkflowDefinition,
  WorkflowExecution,
  NodeExecutionState,
} from "@/lib/types";

interface NodeData extends Record<string, unknown> {
  nodeKind: "agent" | "hitl" | "tool";
  agentId?: string;
  toolName?: string;
  config: Record<string, string>;
  status?: string;
  agents: AgentInfo[];
  selected?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "border-gray-400 bg-gray-700/80",
  running: "border-blue-400 bg-blue-700/80 animate-pulse",
  awaiting_hitl: "border-orange-400 bg-orange-700/80 animate-pulse",
  done: "border-green-500 bg-green-700/80",
  failed: "border-red-500 bg-red-700/80",
};

const KIND_COLOR: Record<NodeData["nodeKind"], string> = {
  agent: "border-purple-400 bg-purple-700/80",
  hitl: "border-orange-400 bg-orange-700/80",
  tool: "border-green-400 bg-green-700/80",
};

const KIND_ICON: Record<NodeData["nodeKind"], string> = {
  agent: "🤖",
  hitl: "🙋",
  tool: "🔧",
};

function ViewNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  const colorClass = d.status ? (STATUS_COLOR[d.status] ?? KIND_COLOR[d.nodeKind]) : KIND_COLOR[d.nodeKind];
  let detail: string;
  if (d.nodeKind === "agent") {
    const agent = d.agents.find((a) => a.id === d.agentId);
    detail = agent ? `${agent.avatarEmoji} ${agent.name}` : "(no agent)";
  } else if (d.nodeKind === "hitl") {
    detail = d.config.prompt ? d.config.prompt.slice(0, 40) : "(prompt)";
  } else {
    detail = d.toolName ?? "(tool)";
  }

  const awaitingHitl = d.status === "awaiting_hitl";

  return (
    <div
      data-test-id={`workflow-node-${id}`}
      data-status={d.status ?? "pending"}
      data-node-type={d.nodeKind}
      data-node-id={id}
      data-awaiting-hitl={awaitingHitl ? "true" : undefined}
      className={`min-w-[180px] rounded-lg border-2 px-3 py-2 text-white shadow-lg ${colorClass} ${d.selected ? "ring-2 ring-white" : ""}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70">
        <span>{KIND_ICON[d.nodeKind]}</span>
        <span>{d.nodeKind === "hitl" ? "HITL" : d.nodeKind}</span>
        {d.status && <span className="ml-auto text-[10px]">{d.status}</span>}
      </div>
      <div className="mt-1 text-sm font-semibold truncate">{detail}</div>
      {d.nodeKind === "hitl" && (
        <div className="text-[10px] text-orange-100/80 italic">human input</div>
      )}
      {awaitingHitl && (
        <div
          className="mt-1 text-[10px] font-bold text-orange-100 bg-orange-900/60 rounded px-1.5 py-0.5 inline-block"
          data-test-id={`workflow-node-${id}-hitl-badge`}
        >
          🙋 needs input
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { view: ViewNode };

// Simple layered (Sugiyama-style) auto-layout: BFS from roots → assign layer → spread within layer.
function autoLayout(def: WorkflowDefinition): Record<string, { x: number; y: number }> {
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const n of def.nodes) {
    indeg.set(n.id, 0);
    succ.set(n.id, []);
  }
  for (const e of def.edges) {
    if (!indeg.has(e.toNodeId) || !succ.has(e.fromNodeId)) continue;
    indeg.set(e.toNodeId, (indeg.get(e.toNodeId) ?? 0) + 1);
    succ.get(e.fromNodeId)!.push(e.toNodeId);
  }
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const n of def.nodes) {
    if ((indeg.get(n.id) ?? 0) === 0) {
      layer.set(n.id, 0);
      queue.push(n.id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const l = layer.get(id) ?? 0;
    for (const next of succ.get(id) ?? []) {
      const nextL = Math.max(layer.get(next) ?? 0, l + 1);
      if (nextL !== layer.get(next)) {
        layer.set(next, nextL);
        queue.push(next);
      }
    }
  }
  // Fallback for nodes never reached (cycles / disconnected)
  for (const n of def.nodes) if (!layer.has(n.id)) layer.set(n.id, 0);

  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }
  const X_GAP = 240;
  const Y_GAP = 140;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [l, ids] of byLayer) {
    ids.forEach((id, i) => {
      positions[id] = { x: 80 + i * X_GAP, y: 60 + l * Y_GAP };
    });
  }
  return positions;
}

function toFlowNodes(
  def: WorkflowDefinition,
  agents: AgentInfo[],
  states: Record<string, NodeExecutionState>,
  selectedId: string | null,
): Node<NodeData>[] {
  const positions = autoLayout(def);
  return def.nodes.map((n) => ({
    id: n.id,
    type: "view",
    position: positions[n.id] ?? { x: 0, y: 0 },
    draggable: false,
    selectable: true,
    data: {
      nodeKind: (n.type as NodeData["nodeKind"]) ?? "agent",
      agentId: n.agentId,
      toolName: n.toolName,
      config: n.config ?? {},
      agents,
      status: states[n.id]?.status,
      selected: selectedId === n.id,
    },
  }));
}

function toFlowEdges(def: WorkflowDefinition, states: Record<string, NodeExecutionState>): Edge[] {
  return def.edges.map((e) => {
    const fromStatus = states[e.fromNodeId]?.status;
    const animated = fromStatus === "running" || fromStatus === "awaiting_hitl";
    return {
      id: `${e.fromNodeId}->${e.toNodeId}`,
      source: e.fromNodeId,
      target: e.toNodeId,
      animated,
      style: { stroke: "#a78bfa" },
    };
  });
}

interface Props {
  groupId: string;
  agents: AgentInfo[];
}

export function WorkflowView({ groupId, agents }: Props) {
  return (
    <ReactFlowProvider>
      <Inner groupId={groupId} agents={agents} />
    </ReactFlowProvider>
  );
}

function Inner({ groupId, agents }: Props) {
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hitlInputs, setHitlInputs] = useState<Record<string, string>>({});
  const [hitlSubmitting, setHitlSubmitting] = useState<Set<string>>(new Set());
  const [runInput, setRunInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  // Debounce SSE-triggered refreshes so a burst of workflow events causes one fetch.
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const refreshExecution = useCallback(async () => {
    try {
      const exec = await api.getWorkflowExecution(groupId);
      setExecution(exec);
    } catch (err) {
      console.error("[Workflow] refresh error:", err);
    }
  }, [groupId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshExecution();
    }, 150);
  }, [refreshExecution]);

  // One-shot hydration: workflow definition + current execution state.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const wf = await api.getWorkflow(groupId);
        if (cancelled) return;
        setDefinition(wf);
        await refreshExecution();
      } catch (err) {
        console.error("[Workflow] Load error:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [groupId, refreshExecution]);

  // Live updates via the existing SSE group stream — no polling.
  // Workflow grain publishes ChatMessages with senderName "Workflow" on every
  // node state change. We re-fetch the execution snapshot on each such event.
  useEventSource(groupId, (msg) => {
    if (msg.senderName === "Workflow" || msg.senderType === "System") {
      scheduleRefresh();
    }
  });

  // Clear "submitting" guards when SSE confirms a HITL node has moved on.
  useEffect(() => {
    if (!execution || hitlSubmitting.size === 0) return;
    setHitlSubmitting((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const s = execution.nodeStates[id]?.status;
        if (s && s !== "awaiting_hitl") {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [execution, hitlSubmitting]);

  const states = execution?.nodeStates ?? {};

  const flowNodes = useMemo(
    () => (definition ? toFlowNodes(definition, agents, states, selectedId) : []),
    [definition, agents, states, selectedId],
  );
  const flowEdges = useMemo(
    () => (definition ? toFlowEdges(definition, states) : []),
    [definition, states],
  );

  const awaitingHitl = useMemo(() => {
    if (!execution || !definition) return [] as { id: string; prompt: string }[];
    return Object.entries(execution.nodeStates)
      .filter(([, s]) => s.status === "awaiting_hitl")
      .map(([id]) => {
        const node = definition.nodes.find((n) => n.id === id);
        return { id, prompt: node?.config?.prompt ?? "Awaiting input" };
      });
  }, [execution, definition]);

  const selectedNode = definition?.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedState = selectedId ? states[selectedId] : undefined;

  const handleRun = async () => {
    if (!definition) return;
    setStatus("Starting...");
    try {
      await api.executeWorkflow(groupId, runInput.trim() ? runInput : undefined);
      setStatus("Running");
      await refreshExecution();
    } catch (err) {
      setStatus(`Run failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleSubmitHitl = async (nodeId: string) => {
    const response = (hitlInputs[nodeId] ?? "").trim();
    if (!response) return;
    if (hitlSubmitting.has(nodeId)) return; // double-submit guard
    setHitlSubmitting((prev) => new Set(prev).add(nodeId));
    try {
      await api.submitHitlResponse(groupId, nodeId, response);
      setHitlInputs((m) => ({ ...m, [nodeId]: "" }));
      setStatus(`HITL submitted for ${nodeId}`);
      // Don't clear the submitting flag here — wait for SSE to confirm the
      // node has moved off awaiting_hitl (handled in the effect above).
    } catch (err) {
      setStatus(`HITL failed: ${err instanceof Error ? err.message : err}`);
      setHitlSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-white/50" data-test-id="workflow-loading">
        Loading workflow…
      </div>
    );
  }

  if (!definition) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center text-center text-white/40 p-6"
        data-test-id="workflow-empty"
      >
        <div className="text-5xl mb-3">🔀</div>
        <h3 className="text-lg font-semibold text-white/70 mb-1">No workflow</h3>
        <p className="text-sm max-w-sm">
          Ask an agent (via the orchestrator) to build a workflow for this group using the
          “Build Workflow” tool. It will appear here when ready.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full" data-test-id="workflow-builder">
      {/* Center: read-only canvas */}
      <div className="flex-1 min-w-0 min-h-[400px] relative bg-gray-950">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {/* Hidden edge markers for E2E selectors */}
        <div className="hidden" aria-hidden="true">
          {definition.edges.map((e) => (
            <span
              key={`${e.fromNodeId}-${e.toNodeId}`}
              data-test-id={`workflow-edge-${e.fromNodeId}-${e.toNodeId}`}
              data-from={e.fromNodeId}
              data-to={e.toNodeId}
            />
          ))}
        </div>

        {/* Top overlay: name + run button */}
        <div className="absolute left-3 top-3 right-3 flex items-center gap-3 pointer-events-none">
          <div className="pointer-events-auto bg-gray-900/80 border border-white/10 rounded px-3 py-1.5">
            <div className="text-[10px] uppercase text-white/40">Workflow</div>
            <div className="text-sm font-semibold text-white" data-test-id="workflow-name">
              {definition.name}
            </div>
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/80 border border-white/10 rounded px-2 py-1.5">
            <input
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder="Optional input…"
              data-test-id="workflow-input"
              className="bg-white/10 text-white text-xs rounded px-2 py-1 w-48 outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              onClick={handleRun}
              disabled={!!execution && !execution.completed}
              data-test-id="workflow-run-btn"
              className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-white/40 text-white rounded px-3 py-1"
            >
              ▶ Run
            </button>
          </div>
        </div>

        {status && (
          <div
            className="absolute bottom-3 left-3 bg-gray-900/80 border border-white/10 rounded px-2 py-1 text-xs text-white/70"
            data-test-id="workflow-status"
          >
            {status}
          </div>
        )}
      </div>

      {/* Right: details + HITL */}
      <div className="w-72 shrink-0 border-l border-white/10 bg-gray-900/60 p-3 overflow-y-auto">
        <div className="text-xs font-semibold uppercase text-white/50 mb-2">Node Details</div>
        {selectedNode ? (
          <>
            <NodeDetails
              node={selectedNode}
              state={selectedState}
              agents={agents}
            />
            {selectedState?.status === "awaiting_hitl" && (
              <form
                data-test-id="hitl-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSubmitHitl(selectedNode.id);
                }}
                className="mt-4 pt-3 border-t border-white/10 space-y-2"
              >
                <div className="text-xs font-semibold uppercase text-orange-400">
                  ⚠ Human input required
                </div>
                <div className="text-xs text-white/70 italic">
                  {selectedNode.config?.prompt ?? "Awaiting input"}
                </div>
                <input
                  value={hitlInputs[selectedNode.id] ?? ""}
                  onChange={(e) =>
                    setHitlInputs((m) => ({ ...m, [selectedNode.id]: e.target.value }))
                  }
                  placeholder="Your response…"
                  data-test-id="hitl-input"
                  className="w-full bg-white/10 text-white text-xs rounded px-2 py-1"
                />
                <button
                  type="submit"
                  data-test-id="hitl-submit"
                  disabled={
                    hitlSubmitting.has(selectedNode.id) ||
                    !(hitlInputs[selectedNode.id] ?? "").trim()
                  }
                  className="w-full text-xs bg-orange-600 hover:bg-orange-500 disabled:bg-orange-900 disabled:text-white/40 text-white rounded px-2 py-1"
                >
                  {hitlSubmitting.has(selectedNode.id) ? "Submitting…" : "Submit"}
                </button>
              </form>
            )}
          </>
        ) : awaitingHitl.length > 0 ? (
          <div className="text-xs text-white/60">
            Click the highlighted node ({awaitingHitl.map((h) => h.id).join(", ")}) to provide input.
          </div>
        ) : (
          <div className="text-xs text-white/40">Click a node to inspect its output</div>
        )}

        {execution && (
          <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/60 space-y-0.5">
            <div data-test-id="workflow-execution-id">exec: {execution.executionId.slice(0, 8)}</div>
            <div data-test-id="workflow-execution-completed">
              completed: {String(execution.completed)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeDetails({
  node,
  state,
  agents,
}: {
  node: WorkflowDefinition["nodes"][number];
  state?: NodeExecutionState;
  agents: AgentInfo[];
}) {
  const agent = node.agentId ? agents.find((a) => a.id === node.agentId) : null;
  return (
    <div
      className="space-y-2 text-xs text-white/80"
      data-test-id="node-details"
      data-node-id={node.id}
    >
      <div>
        <div className="text-white/40">ID</div>
        <div className="font-mono">{node.id}</div>
      </div>
      <div>
        <div className="text-white/40">Type</div>
        <div>{node.type}</div>
      </div>
      {agent && (
        <div>
          <div className="text-white/40">Agent</div>
          <div>
            {agent.avatarEmoji} {agent.name}
          </div>
        </div>
      )}
      {node.toolName && (
        <div>
          <div className="text-white/40">Tool</div>
          <div>{node.toolName}</div>
        </div>
      )}
      {node.config?.prompt && (
        <div>
          <div className="text-white/40">Prompt</div>
          <div className="whitespace-pre-wrap bg-white/5 rounded p-2">{node.config.prompt}</div>
        </div>
      )}
      {state && (
        <div>
          <div className="text-white/40">Status</div>
          <div data-test-id="node-status">{state.status}</div>
        </div>
      )}
      {state?.result && (
        <div>
          <div className="text-white/40">Result</div>
          <div
            className="whitespace-pre-wrap bg-white/5 rounded p-2 max-h-64 overflow-y-auto"
            data-test-id="node-result-text"
          >
            {state.result}
          </div>
        </div>
      )}
      {state?.completedAt && (
        <div>
          <div className="text-white/40">Completed</div>
          <div>{new Date(state.completedAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
