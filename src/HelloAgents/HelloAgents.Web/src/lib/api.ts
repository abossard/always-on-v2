import type {
  ChatGroupSummary,
  ChatGroupDetail,
  AgentInfo,
  CreateGroupRequest,
  CreateAgentRequest,
  SendMessageRequest,
  ChatMessage,
  WorkflowDefinition,
  WorkflowExecution,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Groups ─────────────────────────────────────────────────

export const listGroups = () => api<ChatGroupSummary[]>("/api/groups");

export const getGroup = (id: string) =>
  api<ChatGroupDetail>(`/api/groups/${id}`);

export const createGroup = (req: CreateGroupRequest) =>
  api<ChatGroupDetail>("/api/groups", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const deleteGroup = (id: string) =>
  fetch(`${API_BASE}/api/groups/${id}`, { method: "DELETE" });

// ─── Agents ─────────────────────────────────────────────────

export const listAgents = () => api<AgentInfo[]>("/api/agents");

export const getAgent = (id: string) =>
  api<AgentInfo>(`/api/agents/${id}`);

export const createAgent = (req: CreateAgentRequest) =>
  api<AgentInfo>("/api/agents", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const deleteAgent = (id: string) =>
  fetch(`${API_BASE}/api/agents/${id}`, { method: "DELETE" });

// ─── Membership ─────────────────────────────────────────────

export const addAgentToGroup = (groupId: string, agentId: string) =>
  fetch(`${API_BASE}/api/groups/${groupId}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });

export const removeAgentFromGroup = (groupId: string, agentId: string) =>
  fetch(`${API_BASE}/api/groups/${groupId}/agents/${agentId}`, {
    method: "DELETE",
  });

// ─── Chat ───────────────────────────────────────────────────

export const sendMessage = (groupId: string, req: SendMessageRequest) =>
  api<ChatMessage>(`/api/groups/${groupId}/messages`, {
    method: "POST",
    body: JSON.stringify(req),
  });

export const startDiscussion = (groupId: string, topic?: string) =>
  api<{ status: string }>(`/api/groups/${groupId}/discuss`, {
    method: "POST",
    body: JSON.stringify({ topic }),
  });

// ─── Orchestrator ───────────────────────────────────────────

export const orchestrate = (message: string) =>
  api<{ reply: string }>("/api/orchestrate", {
    method: "POST",
    body: JSON.stringify({ message }),
  });

// ─── Workflow ───────────────────────────────────────────────

export async function getWorkflow(groupId: string): Promise<WorkflowDefinition | null> {
  const res = await fetch(`${API_BASE}/api/groups/${groupId}/workflow`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

export async function saveWorkflow(groupId: string, workflow: WorkflowDefinition): Promise<void> {
  const res = await fetch(`${API_BASE}/api/groups/${groupId}/workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
}

export async function executeWorkflow(groupId: string, input?: string): Promise<{ executionId: string }> {
  return api<{ executionId: string }>(`/api/groups/${groupId}/workflow/execute`, {
    method: "POST",
    body: JSON.stringify({ input: input ?? null }),
  });
}

export async function getWorkflowExecution(groupId: string): Promise<WorkflowExecution | null> {
  const res = await fetch(`${API_BASE}/api/groups/${groupId}/workflow/execution`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

export async function submitHitlResponse(groupId: string, nodeId: string, response: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/groups/${groupId}/workflow/execution/hitl/${nodeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
}
