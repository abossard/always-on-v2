"use client";

import { useState, useEffect, useCallback } from "react";
import { GroupList } from "@/components/GroupList";
import { ChatView } from "@/components/ChatView";
import { AgentRoster } from "@/components/AgentRoster";
import { OrchestratorSidebar } from "@/components/OrchestratorSidebar";
import { StreamDiagnostics } from "@/components/StreamDiagnostics";
import { useEventSource } from "@/hooks/useEventSource";
import * as api from "@/lib/api";
import type { ChatGroupSummary, ChatGroupDetail, AgentInfo, ChatMessage } from "@/lib/types";

export default function HomePage() {
  const [groups, setGroups] = useState<ChatGroupSummary[]>([]);
  const [allAgents, setAllAgents] = useState<AgentInfo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<ChatGroupDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groupAgents, setGroupAgents] = useState<AgentInfo[]>([]);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [streamEvents, setStreamEvents] = useState<ChatMessage[]>([]);

  // Fetch groups and agents on mount
  const refreshGroups = useCallback(async () => {
    const g = await api.listGroups();
    setGroups(g);
  }, []);

  const refreshAgents = useCallback(async () => {
    const a = await api.listAgents();
    setAllAgents(a);
  }, []);

  useEffect(() => {
    refreshGroups();
    refreshAgents();
  }, [refreshGroups, refreshAgents]);

  // Fetch group detail when selected
  useEffect(() => {
    if (!selectedGroupId) {
      setGroupDetail(null);
      setMessages([]);
      setGroupAgents([]);
      setStreamEvents([]);
      return;
    }

    setIsLoadingGroup(true);
    api.getGroup(selectedGroupId).then(async (detail) => {
      setGroupDetail(detail);
      setMessages(detail.messages);
      // Fetch full agent info (includes groupIds) for each member
      const agents = await Promise.all(
        detail.agents.map(a => api.getAgent(a.id).catch(() => null))
      );
      setGroupAgents(agents.filter(Boolean) as AgentInfo[]);
      setIsLoadingGroup(false);
    }).catch(() => setIsLoadingGroup(false));
  }, [selectedGroupId]);

  // SSE for real-time messages
  useEventSource(selectedGroupId, (msg) => {
    // Track stream events for diagnostics
    setStreamEvents((prev) => [...prev.slice(-49), msg]);

    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });

    // Auto-refresh agent roster on join/leave events
    if (msg.eventType === "AgentJoined" || msg.eventType === "AgentLeft") {
      if (selectedGroupId) {
        api.getGroup(selectedGroupId).then(async (detail) => {
          setGroupDetail(detail);
          const agents = await Promise.all(
            detail.agents.map(a => api.getAgent(a.id).catch(() => null))
          );
          setGroupAgents(agents.filter(Boolean) as AgentInfo[]);
        }).catch(() => {});
        refreshGroups();
        refreshAgents();
      }
    }
  });

  // Refresh all data (called by orchestrator after actions)
  const refreshAll = useCallback(async () => {
    await refreshGroups();
    await refreshAgents();
    if (selectedGroupId) {
      try {
        const detail = await api.getGroup(selectedGroupId);
        setGroupDetail(detail);
        setMessages(detail.messages);
        const agents = await Promise.all(
          detail.agents.map(a => api.getAgent(a.id).catch(() => null))
        );
        setGroupAgents(agents.filter(Boolean) as AgentInfo[]);
      } catch { /* group may have been deleted */ }
    }
  }, [refreshGroups, refreshAgents, selectedGroupId]);

  // ─── Handlers ───────────────────────────────────────────

  const handleCreateGroup = async (name: string, description: string) => {
    const group = await api.createGroup({ name, description });
    await refreshGroups();
    setSelectedGroupId(group.id);
  };

  const handleDeleteGroup = async (id: string) => {
    await api.deleteGroup(id);
    if (selectedGroupId === id) setSelectedGroupId(null);
    await refreshGroups();
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedGroupId) return;
    setIsSending(true);
    try {
      const msg = await api.sendMessage(selectedGroupId, { senderName: "You", content });
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      await refreshGroups();
    } finally {
      setIsSending(false);
    }
  };

  const handleStartDiscussion = async (topic?: string) => {
    if (!selectedGroupId) return;
    setIsDiscussing(true);
    try {
      await api.startDiscussion(selectedGroupId, topic);
      // Responses arrive via SSE — no need to merge manually
    } finally {
      setIsDiscussing(false);
      await refreshGroups();
    }
  };

  const handleAddAgent = async (agentId: string) => {
    if (!selectedGroupId) return;
    setIsAddingAgent(true);
    try {
      await api.addAgentToGroup(selectedGroupId, agentId);
      // Agent roster updates reactively via SSE AgentJoined event
      await refreshGroups();
      await refreshAgents();
    } finally {
      setIsAddingAgent(false);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (!selectedGroupId) return;
    await api.removeAgentFromGroup(selectedGroupId, agentId);
    // Agent roster updates reactively via SSE AgentLeft event
    await refreshGroups();
    await refreshAgents();
  };

  const handleCreateAgent = async (name: string, persona: string, emoji: string) => {
    setIsCreatingAgent(true);
    try {
      const agent = await api.createAgent({
        name,
        personaDescription: persona,
        avatarEmoji: emoji,
      });
      await refreshAgents();
      if (selectedGroupId) {
        await handleAddAgent(agent.id);
      }
    } finally {
      setIsCreatingAgent(false);
    }
  };

  return (
    <>
      <div className="h-screen flex bg-gray-900 text-white" data-test-id="chat-app-ready">
        {/* Left: Group list */}
        <div className="w-64 flex-shrink-0 border-r border-white/10 bg-gray-900/80">
          <GroupList
            groups={groups}
            selectedId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onCreate={handleCreateGroup}
            onDelete={handleDeleteGroup}
          />
        </div>

        {/* Center: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {isLoadingGroup ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/40">
                <div className="text-4xl mb-3 animate-pulse">💬</div>
                <p className="text-sm">Loading group...</p>
              </div>
            </div>
          ) : selectedGroupId && groupDetail ? (
            <ChatView
              messages={messages}
              onSendMessage={handleSendMessage}
              onStartDiscussion={handleStartDiscussion}
              isDiscussing={isDiscussing}
              isSending={isSending}
              groupName={groupDetail.name}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/30">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-xl font-semibold mb-2">HelloAgents</h2>
                <p className="text-sm">Select or create a group to start chatting with AI agents</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Agent roster */}
        {selectedGroupId && groupDetail && (
          <div className="w-64 flex-shrink-0 border-l border-white/10 bg-gray-900/80">
            <AgentRoster
              agents={groupAgents}
              allAgents={allAgents}
              onAddAgent={handleAddAgent}
              onRemoveAgent={handleRemoveAgent}
              onCreateAgent={handleCreateAgent}
              isAddingAgent={isAddingAgent}
              isCreatingAgent={isCreatingAgent}
            />
          </div>
        )}
      </div>

      {/* Floating panels */}
      <OrchestratorSidebar onActionComplete={refreshAll} />
      <StreamDiagnostics events={streamEvents} />
    </>
  );
}
