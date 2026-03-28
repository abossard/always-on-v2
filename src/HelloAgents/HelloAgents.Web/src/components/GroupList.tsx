"use client";

import { useState } from "react";
import type { ChatGroupSummary } from "@/lib/types";

interface Props {
  groups: ChatGroupSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string) => void;
  onDelete: (id: string) => void;
}

export function GroupList({ groups, selectedId, onSelect, onCreate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setShowForm(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-white/80">Chat Groups</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded transition-colors"
        >
          + New
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-white/10 space-y-2">
          <input
            type="text"
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white/10 text-white text-sm rounded px-2 py-1.5 placeholder-white/40 outline-none focus:ring-1 focus:ring-indigo-400"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full bg-white/10 text-white text-sm rounded px-2 py-1.5 placeholder-white/40 outline-none focus:ring-1 focus:ring-indigo-400"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm py-1.5 rounded transition-colors"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="text-white/40 text-xs p-3">No groups yet. Create one!</p>
        )}
        {groups.map((g) => (
          <div
            key={g.id}
            onClick={() => onSelect(g.id)}
            data-testid={`group-${g.id}`}
            className={`p-3 cursor-pointer border-b border-white/5 hover:bg-white/10 transition-colors ${
              selectedId === g.id ? "bg-white/15" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{g.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(g.id); }}
                className="text-white/30 hover:text-red-400 text-xs transition-colors"
                title="Delete group"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-white/40 mt-0.5 truncate">{g.description || "No description"}</p>
            <div className="text-xs text-white/30 mt-1">
              {g.agentCount} agents · {g.messageCount} messages
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
