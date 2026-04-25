"use client";

import { useState, useRef, useEffect } from "react";
import { orchestrate } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onActionComplete: () => void | Promise<void>;
}

export function OrchestratorSidebar({ onActionComplete }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I can help you create groups, add agents, start discussions, and delete groups. Try something like:\n\n• \"Create a debate group about climate change\"\n• \"Delete all groups except the last one\"\n• \"Delete all groups\"\n• \"Delete some random groups\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await orchestrate(userMsg.content);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.reply || "Done!",
        },
      ]);
      // Refresh the main UI after the orchestrator may have modified state
      await onActionComplete();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "Create a debate group about AI ethics with a skeptic and an optimist",
    "Delete all groups except the last one",
    "Delete all groups",
    "Delete some random groups",
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 bg-indigo-500 hover:bg-indigo-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110 z-50"
        title="AI Orchestrator"
        data-test-id="orchestrator-toggle"
      >
        ✨
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 flex h-150 w-96 flex-col rounded-xl border border-white/10 bg-gray-800 shadow-2xl" data-test-id="orchestrator-panel">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <h3 className="font-semibold text-sm text-white">AI Orchestrator</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white/40 hover:text-white text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${
              msg.role === "user"
                ? "bg-indigo-500/30 rounded-lg px-3 py-2 ml-8"
                : "bg-white/5 rounded-lg px-3 py-2 mr-4"
            }`}
          >
            <p className="whitespace-pre-wrap text-white/90">{msg.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="bg-white/5 rounded-lg px-3 py-2 mr-4">
            <div className="flex gap-1.5 items-center">
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
              <span className="text-xs text-white/30 ml-2">Working on it...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (show only if no user messages yet) */}
      {messages.length <= 1 && (
        <div className="px-3 pb-2 space-y-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setInput(s)}
              className="w-full text-left text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 px-2.5 py-1.5 rounded transition-colors truncate"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={isLoading ? "Working..." : "Ask me to create groups, agents..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isLoading}
            className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 placeholder-white/30 outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-800 disabled:text-white/50 text-white px-3 py-2 rounded-lg text-sm transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
