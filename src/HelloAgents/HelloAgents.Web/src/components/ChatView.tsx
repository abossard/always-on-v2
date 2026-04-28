"use client";

import { useRef, useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { HitlChatCard } from "./HitlChatCard";

interface Props {
  groupId: string;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onStartDiscussion: (topic?: string) => void;
  isDiscussing: boolean;
  isSending: boolean;
  groupName: string;
  thinkingAgents: Map<string, string>;
}

function parseHitlMessage(content: string): { nodeId: string; prompt: string } | null {
  const match = content.match(/\[node=([^\]]+)\]:\s*(.+?)(?:\.\s*Context:|$)/);
  if (!match) return null;
  return { nodeId: match[1], prompt: match[2].trim() };
}

export function ChatView({ groupId, messages, onSendMessage, onStartDiscussion, isDiscussing, isSending, groupName, thinkingAgents }: Props) {
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const isSystemEvent = (msg: ChatMessage) =>
    msg.eventType === "AgentJoined" || msg.eventType === "AgentLeft";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-semibold text-white">{groupName}</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Discussion topic..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-40 bg-white/10 text-white text-xs rounded px-2 py-1.5 outline-none placeholder-white/30"
          />
          <button
            onClick={() => { onStartDiscussion(topic || undefined); setTopic(""); }}
            disabled={isDiscussing}
            className="text-xs bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:text-white/50 text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          >
            {isDiscussing ? (
              <>
                <span className="animate-spin">⚙️</span> Discussing...
              </>
            ) : (
              <>🤖 Start Discussion</>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-white/30 text-sm text-center mt-8">
            No messages yet. Send a message or start a discussion!
          </p>
        )}
        {messages.map((msg) => {
          // System events (join/leave) — centered, muted
          if (isSystemEvent(msg)) {
            const action = msg.eventType === "AgentJoined" ? "joined the group" : "left the group";
            // SSE delivers raw events with content=agentId; persisted messages have formatted content.
            // Use senderName + senderEmoji for a consistent display.
            const label = `${msg.senderEmoji} ${msg.senderName} ${action}`;
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-white/40 bg-white/5 rounded-full px-3 py-1">
                  {label}
                </span>
              </div>
            );
          }

          // HITL prompt — render inline interactive card (check before generic System)
          if (msg.senderName === "HITL") {
            const parsed = parseHitlMessage(msg.content);
            if (parsed) {
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="text-2xl flex-shrink-0 mt-1">🙋</div>
                  <div className="flex-1 max-w-[75%]">
                    <HitlChatCard
                      groupId={groupId}
                      nodeId={parsed.nodeId}
                      prompt={parsed.prompt}
                    />
                  </div>
                </div>
              );
            }
          }

          // System messages (e.g., discuss trigger) — centered
          if (msg.senderType === "System") {
            const displayContent = msg.content.replace(/ — input: .+$/, "");
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-amber-400/60 bg-amber-400/5 rounded-full px-3 py-1">
                  🔔 {displayContent}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.senderType === "User" ? "justify-end" : ""}`}
            >
              {msg.senderType === "Agent" && (
                <div className="text-2xl flex-shrink-0 mt-1">{msg.senderEmoji}</div>
              )}
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  msg.senderType === "User"
                    ? "bg-indigo-500/30 text-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-white/80">
                    {msg.senderName}
                  </span>
                  <span className="text-xs text-white/30">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
              {msg.senderType === "User" && (
                <div className="text-2xl flex-shrink-0 mt-1">👤</div>
              )}
            </div>
          );
        })}
        {(isSending || isDiscussing) && (
          <div className="flex gap-3 items-center">
            <div className="text-2xl">🤖</div>
            <div className="bg-white/10 rounded-lg px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
            <span className="text-xs text-white/30">
              {isDiscussing ? "Agents are discussing..." : "Sending..."}
            </span>
          </div>
        )}
        {/* Per-agent thinking/streaming indicators */}
        {Array.from(thinkingAgents).map(([agentName, partialText]) => (
          <div key={`thinking-${agentName}`} className="flex gap-3">
            <div className="text-2xl flex-shrink-0 mt-1">🤖</div>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 ${partialText ? "bg-white/10 text-white" : "bg-yellow-500/10 border border-yellow-500/20"}`}>
              {partialText ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white/80">{agentName}</span>
                    <span className="text-xs text-yellow-300/50">streaming...</span>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {partialText}
                    <span className="inline-block w-1.5 h-4 bg-yellow-400/60 ml-0.5 animate-pulse align-text-bottom" />
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-yellow-300/70">{agentName} will respond...</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={isSending ? "Sending..." : "Type a message..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isSending && handleSend()}
            disabled={isSending}
            className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2.5 text-sm placeholder-white/40 outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isSending}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-800 disabled:text-white/50 text-white px-4 py-2.5 rounded-lg transition-colors text-sm"
          >
            {isSending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
