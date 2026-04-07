"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface Props {
  events: ChatMessage[];
}

const eventTypeColors: Record<string, string> = {
  Message: "text-blue-400",
  AgentJoined: "text-emerald-400",
  AgentLeft: "text-rose-400",
  Thinking: "text-yellow-400",
  Streaming: "text-cyan-400",
};

const senderTypeIcons: Record<string, string> = {
  User: "👤",
  Agent: "🤖",
  System: "⚡",
};

export function StreamDiagnostics({ events }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-72 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm shadow-lg transition-all duration-200 ${
          isOpen
            ? "bg-cyan-500 text-white shadow-cyan-500/30"
            : "bg-gray-800 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400/60"
        }`}
        title="Stream Diagnostics"
      >
        {isOpen ? "✕" : "📡"}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-12 left-0 w-96 max-h-80 bg-gray-950/95 backdrop-blur border border-cyan-500/20 rounded-lg shadow-xl shadow-cyan-500/5 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-3 py-2 border-b border-cyan-500/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-xs font-mono text-cyan-300">Stream Events</span>
            </div>
            <span className="text-xs font-mono text-white/30">{events.length} events</span>
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
            {events.length === 0 && (
              <p className="text-white/20 text-center py-4">Waiting for stream events...</p>
            )}
            {events.map((e, i) => (
              <div
                key={`${e.id}-${i}`}
                className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-white/5 transition-colors"
              >
                <span className="text-white/20 w-4 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-shrink-0">
                  {senderTypeIcons[e.senderType] ?? "?"}
                </span>
                <span className={`flex-shrink-0 ${eventTypeColors[e.eventType ?? "Message"] ?? "text-white/50"}`}>
                  {e.eventType ?? "Message"}
                </span>
                <span className="text-white/50 truncate flex-1">
                  {e.senderName}
                  {e.eventType === "Message" && `: ${e.content?.slice(0, 60)}${(e.content?.length ?? 0) > 60 ? "…" : ""}`}
                </span>
                <span className="text-white/15 flex-shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="px-3 py-1.5 border-t border-cyan-500/10 flex gap-3">
            <span className="text-[10px] text-blue-400">● Message</span>
            <span className="text-[10px] text-emerald-400">● Joined</span>
            <span className="text-[10px] text-rose-400">● Left</span>
            <span className="text-[10px] text-yellow-400">● Thinking</span>
            <span className="text-[10px] text-cyan-400">● Streaming</span>
          </div>
        </div>
      )}
    </div>
  );
}
