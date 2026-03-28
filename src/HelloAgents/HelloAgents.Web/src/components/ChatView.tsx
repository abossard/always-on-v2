"use client";

import { useRef, useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onStartDiscussion: (rounds: number) => void;
  isDiscussing: boolean;
  isSending: boolean;
  groupName: string;
}

export function ChatView({ messages, onSendMessage, onStartDiscussion, isDiscussing, isSending, groupName }: Props) {
  const [input, setInput] = useState("");
  const [rounds, setRounds] = useState(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-semibold text-white">{groupName}</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/50">Rounds:</label>
          <input
            type="number"
            min={1}
            max={5}
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-12 bg-white/10 text-white text-xs rounded px-1.5 py-1 outline-none text-center"
          />
          <button
            onClick={() => onStartDiscussion(rounds)}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-white/30 text-sm text-center mt-8">
            No messages yet. Send a message or start a discussion!
          </p>
        )}
        {messages.map((msg) => (
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
        ))}
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
