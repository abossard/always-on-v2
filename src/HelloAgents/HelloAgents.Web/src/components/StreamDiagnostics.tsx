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
  const lastEvent = events.at(-1);
  const lastEventType = lastEvent?.eventType ?? "Message";

  return (
    <div className="shrink-0 border-t border-white/10 bg-gray-900 text-white" data-test-id="stream-diagnostics">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-3 px-3 text-left text-xs transition-colors hover:bg-white/5"
        title="Stream Diagnostics"
        aria-expanded={isOpen}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
        </span>
        <span className="text-sm" aria-hidden="true">📡</span>
        <span className="font-mono text-cyan-300">Stream Diagnostics</span>
        <span className="font-mono text-white/40">{events.length} events</span>
        <span className="min-w-0 flex-1 truncate font-mono text-white/60">
          Last: <span className={eventTypeColors[lastEventType] ?? "text-white/50"}>{lastEvent ? lastEventType : "none"}</span>
        </span>
        <span className="font-mono text-white/40">{isOpen ? "Collapse" : "Expand"}</span>
      </button>

      {isOpen && (
        <div className="max-h-72 overflow-hidden border-t border-white/10 bg-gray-950/95 flex flex-col">
          <div className="px-3 py-2 border-b border-cyan-500/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-cyan-300">Stream Events</span>
            </div>
            <span className="text-xs font-mono text-white/30">{events.length} events</span>
          </div>

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
