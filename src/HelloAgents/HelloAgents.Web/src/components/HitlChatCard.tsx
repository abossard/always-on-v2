"use client";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";

interface Props {
  groupId: string;
  nodeId: string;
  prompt: string;
  executionId?: string;
  onSubmitted?: () => void;
}

export function HitlChatCard({ groupId, nodeId, prompt, onSubmitted }: Props) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [predecessors, setPredecessors] = useState<{ nodeId: string; label: string; result: string }[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    if (submitted) {
      setLoadingContext(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.getWorkflowExecution(groupId),
      api.getWorkflow(groupId),
    ])
      .then(([exec, wf]) => {
        if (cancelled) return;
        if (!exec || !wf) {
          setLoadingContext(false);
          return;
        }
        const predNodeIds = wf.edges
          .filter((e: any) => e.toNodeId === nodeId)
          .map((e: any) => e.fromNodeId);
        const preds = predNodeIds
          .map((pid: string) => {
            const node = wf.nodes.find((n: any) => n.id === pid);
            const label = node?.agentId ? `Agent: ${pid}` : pid;
            return {
              nodeId: pid,
              label,
              result: exec.nodeStates?.[pid]?.result ?? "",
            };
          })
          .filter((p: any) => p.result);
        setPredecessors(preds);
        setLoadingContext(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, nodeId, submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!response.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.submitHitlResponse(groupId, nodeId, response.trim());
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      console.error("HITL submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div data-test-id="hitl-chat-card" className="bg-orange-900/30 border border-orange-500/30 rounded-lg p-3 my-2">
        <div className="text-xs text-orange-400">✅ Response submitted</div>
      </div>
    );
  }

  return (
    <div data-test-id="hitl-chat-card" className="bg-orange-900/30 border border-orange-500/30 rounded-lg p-3 my-2">
      <div className="text-xs font-semibold uppercase text-orange-400 mb-1">🙋 Human Input Required</div>
      {predecessors.length > 0 && (
        <div data-test-id="hitl-predecessor-context" className="space-y-2 mb-3">
          <div className="text-xs font-semibold uppercase text-white/40">Previous Output</div>
          {predecessors.map((p) => (
            <div
              key={p.nodeId}
              data-test-id={`hitl-predecessor-${p.nodeId}`}
              className="bg-white/5 rounded p-2 max-h-48 overflow-y-auto"
            >
              <div className="text-xs text-white/50 mb-1">{p.label}</div>
              <pre className="text-sm text-white/80 whitespace-pre-wrap break-words font-sans">
                {p.result}
              </pre>
            </div>
          ))}
        </div>
      )}
      {loadingContext && !submitted && (
        <div className="text-xs text-white/30 mb-2">Loading context…</div>
      )}
      <div data-test-id="hitl-chat-card-prompt" className="text-sm text-white/80 mb-2">{prompt}</div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          data-test-id="hitl-chat-card-input"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Your response..."
          className="flex-1 bg-white/10 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button
          type="submit"
          data-test-id="hitl-chat-card-submit"
          disabled={submitting || !response.trim()}
          className="text-sm bg-orange-600 hover:bg-orange-500 disabled:bg-orange-900 disabled:text-white/40 text-white rounded px-3 py-1"
        >
          {submitting ? "..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
