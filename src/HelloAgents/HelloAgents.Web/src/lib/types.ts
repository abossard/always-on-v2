// State of the agent, make sure this aligns with your agent's state.
// ─── API Types ──────────────────────────────────────────────

export type SenderType = "User" | "Agent" | "System";
export type EventType = "Message" | "AgentJoined" | "AgentLeft" | "Thinking" | "Streaming";

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
  modelDeployment?: string;
}

export interface CreateGroupRequest {
  name: string;
  description: string;
}

export interface CreateAgentRequest {
  name: string;
  personaDescription: string;
  avatarEmoji: string;
  modelDeployment?: string;
}

export interface SendMessageRequest {
  senderName: string;
  content: string;
}

export interface DiscussRequest {
  topic?: string;
}

// ─── Workflow Types ─────────────────────────────────────────

export type WorkflowNodeType = "agent" | "hitl" | "tool";
export type WorkflowNodeStatus = "pending" | "running" | "awaiting_hitl" | "done" | "failed";

export interface WorkflowNode {
  id: string;
  type: string;
  agentId?: string;
  toolName?: string;
  config: Record<string, string>;
}

export interface WorkflowEdge {
  fromNodeId: string;
  toNodeId: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface NodeExecutionState {
  status: string;
  result?: string;
  completedAt?: string;
}

export interface WorkflowExecution {
  executionId: string;
  groupId: string;
  completed: boolean;
  nodeStates: Record<string, NodeExecutionState>;
}

export interface ExecutionSummary {
  executionId: string;
  completed: boolean;
  createdAt: string;
}

export interface ExecutionListView {
  active: ExecutionSummary[];
  history: ExecutionSummary[];
}
