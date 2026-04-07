// State of the agent, make sure this aligns with your agent's state.
// ─── API Types ──────────────────────────────────────────────

export type SenderType = "User" | "Agent" | "System";
export type EventType = "Message" | "AgentJoined" | "AgentLeft" | "Thinking";

export interface ChatMessage {
  id: string;
  groupId: string;
  senderName: string;
  senderEmoji: string;
  senderType: SenderType;
  content: string;
  timestamp: string;
  eventType?: EventType;
}

export interface AgentMemberInfo {
  id: string;
  name: string;
  avatarEmoji: string;
}

export interface ChatGroupSummary {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  messageCount: number;
  createdAt: string;
}

export interface ChatGroupDetail {
  id: string;
  name: string;
  description: string;
  agents: AgentMemberInfo[];
  messages: ChatMessage[];
  createdAt: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  avatarEmoji: string;
  groupIds: string[];
  reflectionJournal: string;
}

export interface CreateGroupRequest {
  name: string;
  description: string;
}

export interface CreateAgentRequest {
  name: string;
  personaDescription: string;
  avatarEmoji: string;
}

export interface SendMessageRequest {
  senderName: string;
  content: string;
}

export interface DiscussRequest {
  topic?: string;
}
