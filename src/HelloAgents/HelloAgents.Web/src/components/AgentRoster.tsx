"use client";

import { useState } from "react";
import type { AgentInfo } from "@/lib/types";

interface Props {
  agents: AgentInfo[];
  allAgents: AgentInfo[];
  onAddAgent: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onCreateAgent: (name: string, persona: string, emoji: string) => void;
  isAddingAgent: boolean;
  isCreatingAgent: boolean;
}

export function AgentRoster({ agents, allAgents, onAddAgent, onRemoveAgent, onCreateAgent, isAddingAgent, isCreatingAgent }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [emoji, setEmoji] = useState("🤖");

  const availableAgents = allAgents.filter(
    (a) => !agents.some((g) => g.id === a.id)
  );

  const handleCreate = () => {
    if (!name.trim() || !persona.trim()) return;
    onCreateAgent(name.trim(), persona.trim(), emoji);
    setName("");
    setPersona("");
    setEmoji("🤖");
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/10">
        <h2 className="font-semibold text-sm text-white/80">Agents in Group</h2>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 && (
          <p className="text-white/40 text-xs p-3">No agents yet. Add one below!</p>
        )}
        {agents.map((agent) => (
          <div key={agent.id} className="p-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{agent.avatarEmoji}</span>
              <div>
                <div className="text-sm font-medium text-white">{agent.name}</div>
                <div className="text-xs text-white/30">{agent.groupIds.length} groups</div>
              </div>
            </div>
            <button
              onClick={() => onRemoveAgent(agent.id)}
              className="text-white/30 hover:text-red-400 text-xs transition-colors"
              title="Remove from group"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add existing agent */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {isAddingAgent && (
          <div className="text-xs text-indigo-300 text-center py-1 animate-pulse">Adding agent...</div>
        )}

        {availableAgents.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) onAddAgent(e.target.value);
              e.target.value = "";
            }}
            disabled={isAddingAgent}
            className="w-full bg-white/10 text-white text-sm rounded px-2 py-1.5 outline-none appearance-none cursor-pointer disabled:opacity-50"
            defaultValue=""
          >
            <option value="" disabled className="bg-gray-800">+ Add existing agent</option>
            {availableAgents.map((a) => (
              <option key={a.id} value={a.id} className="bg-gray-800">
                {a.avatarEmoji} {a.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => setShowCreate(!showCreate)}
          disabled={isCreatingAgent}
          className="w-full text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {isCreatingAgent ? "Creating..." : showCreate ? "Cancel" : "✨ Create New Agent"}
        </button>

        {showCreate && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-12 bg-white/10 text-white text-sm rounded px-2 py-1.5 text-center outline-none"
              />
              <input
                type="text"
                placeholder="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 bg-white/10 text-white text-sm rounded px-2 py-1.5 placeholder-white/40 outline-none"
              />
            </div>
            <textarea
              placeholder="Describe the agent's personality and expertise..."
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={3}
              className="w-full bg-white/10 text-white text-sm rounded px-2 py-1.5 placeholder-white/40 outline-none resize-none"
            />
            <button
              onClick={handleCreate}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm py-1.5 rounded transition-colors"
            >
              Create & Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
