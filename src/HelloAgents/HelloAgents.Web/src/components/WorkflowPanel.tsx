"use client";

import { WorkflowView } from "./WorkflowView";
import type { AgentInfo } from "@/lib/types";

interface Props {
  groupId: string;
  groupName: string;
  agents: AgentInfo[];
  onClose: () => void;
}

export function WorkflowPanel({ groupId, groupName, agents, onClose }: Props) {
  return (
    <div className="flex h-full flex-col" data-test-id="workflow-panel">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-gray-900/80">
        <div>
          <div className="text-xs uppercase text-white/40">Workflow</div>
          <h2 className="text-lg font-semibold text-white">{groupName}</h2>
        </div>
        <button
          onClick={onClose}
          data-test-id="workflow-close-btn"
          className="text-white/50 hover:text-white text-sm bg-white/5 hover:bg-white/10 rounded px-3 py-1.5"
        >
          ← Back to Chat
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <WorkflowView groupId={groupId} agents={agents} />
      </div>
    </div>
  );
}
