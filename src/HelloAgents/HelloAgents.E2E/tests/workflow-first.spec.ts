import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ─── Configuration ────────────────────────────────────────
const apiBaseURL = process.env.services__api__http__0
  ?? process.env.PRODUCTION_API_URL
  ?? 'http://localhost:5100';

const SCREENSHOT_DIR = 'screenshots';

// ─── Types ────────────────────────────────────────────────
type NodeStatus = 'pending' | 'running' | 'awaiting_hitl' | 'done' | 'failed';

// New node type added by workflow-first refactor: 'broadcast'.
type NodeType = 'agent' | 'hitl' | 'tool' | 'broadcast';

interface WorkflowNode {
  id: string;
  type: NodeType;
  agentId?: string | null;
  toolName?: string | null;
  config?: Record<string, string>;
}

interface WorkflowEdge {
  fromNodeId: string;
  toNodeId: string;
  condition?: string | null;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// New: trigger descriptor — every group's workflow declares triggers.
interface WorkflowTrigger {
  type: string; // 'user-message' | 'manual' | 'discuss'
  config?: Record<string, string>;
}

// Extended workflow shape after refactor.
interface WorkflowDefinitionV2 extends WorkflowDefinition {
  triggers?: WorkflowTrigger[];
  version?: number;
  concurrency?: 'serial' | 'parallel';
}

interface NodeExecutionState {
  status: NodeStatus;
  result?: string | null;
  completedAt?: string | null;
}

interface WorkflowExecutionView {
  executionId: string;
  groupId: string;
  completed: boolean;
  nodeStates: Record<string, NodeExecutionState>;
}

// New endpoint: GET /api/groups/{id}/executions
interface ExecutionSummary {
  executionId: string;
  completed: boolean;
  triggeredBy?: string;
  createdAt?: string;
  completedAt?: string;
}

interface ExecutionListResponse {
  active: ExecutionSummary[];
  history: ExecutionSummary[];
}

interface GroupMessage {
  id: string;
  senderName: string;
  content: string;
  createdAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────

let counter = 0;
function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${++counter}`;
}

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });
}

async function createGroupViaAPI(request: APIRequestContext, name: string, description = '') {
  const res = await request.post(`${apiBaseURL}/api/groups`, {
    data: { name, description },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

async function createAgentViaAPI(request: APIRequestContext, name: string, persona: string, emoji: string) {
  const res = await request.post(`${apiBaseURL}/api/agents`, {
    data: { name, personaDescription: persona, avatarEmoji: emoji },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

async function addAgentToGroupViaAPI(request: APIRequestContext, groupId: string, agentId: string) {
  const res = await request.post(`${apiBaseURL}/api/groups/${groupId}/agents`, {
    data: { agentId },
  });
  expect(res.ok()).toBeTruthy();
  await new Promise(r => setTimeout(r, 300));
}

async function getWorkflowViaAPI(
  request: APIRequestContext,
  groupId: string,
): Promise<{ status: number; body: WorkflowDefinitionV2 | null }> {
  const res = await request.get(`${apiBaseURL}/api/groups/${groupId}/workflow`);
  if (res.status() === 404) return { status: 404, body: null };
  expect(res.ok(), `GET workflow failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return { status: res.status(), body: (await res.json()) as WorkflowDefinitionV2 };
}

async function putWorkflowViaAPI(
  request: APIRequestContext,
  groupId: string,
  workflow: WorkflowDefinition,
) {
  const res = await request.put(`${apiBaseURL}/api/groups/${groupId}/workflow`, {
    data: { workflow },
  });
  expect(res.ok(), `PUT workflow failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as WorkflowDefinitionV2;
}

async function sendMessageViaAPI(
  request: APIRequestContext,
  groupId: string,
  senderName: string,
  content: string,
) {
  const res = await request.post(`${apiBaseURL}/api/groups/${groupId}/messages`, {
    data: { senderName, content },
  });
  expect(res.ok(), `POST message failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function getMessagesViaAPI(request: APIRequestContext, groupId: string): Promise<GroupMessage[]> {
  // No dedicated GET /messages endpoint — messages are embedded in the group detail
  const res = await request.get(`${apiBaseURL}/api/groups/${groupId}`);
  expect(res.ok()).toBeTruthy();
  const detail = await res.json();
  return (detail.messages ?? []) as GroupMessage[];
}

async function getCurrentExecutionViaAPI(
  request: APIRequestContext,
  groupId: string,
): Promise<WorkflowExecutionView | null> {
  const res = await request.get(`${apiBaseURL}/api/groups/${groupId}/workflow/execution`);
  if (res.status() === 404) return null;
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as WorkflowExecutionView;
}

async function executeWorkflowViaAPI(
  request: APIRequestContext,
  groupId: string,
  input?: string,
): Promise<{ executionId: string }> {
  const res = await request.post(`${apiBaseURL}/api/groups/${groupId}/workflow/execute`, {
    data: { input: input ?? null },
  });
  expect(res.status(), `Execute workflow failed: ${await res.text()}`).toBe(202);
  return (await res.json()) as { executionId: string };
}

async function waitForNodeStatus(
  request: APIRequestContext,
  groupId: string,
  nodeId: string,
  status: NodeStatus,
  timeoutMs = 60_000,
): Promise<NodeExecutionState> {
  const start = Date.now();
  let last: NodeExecutionState | undefined;
  while (Date.now() - start < timeoutMs) {
    const view = await getCurrentExecutionViaAPI(request, groupId);
    last = view?.nodeStates?.[nodeId];
    if (last?.status === status) return last;
    if (last?.status === 'failed' && status !== 'failed') {
      throw new Error(`Node ${nodeId} failed unexpectedly: ${last?.result}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for node ${nodeId} to reach status "${status}". Last seen: ${JSON.stringify(last)}`,
  );
}

// New endpoint introduced by the workflow-first refactor.
async function getExecutionsListViaAPI(
  request: APIRequestContext,
  groupId: string,
): Promise<{ status: number; body: ExecutionListResponse | null }> {
  const res = await request.get(`${apiBaseURL}/api/groups/${groupId}/executions`);
  if (!res.ok()) return { status: res.status(), body: null };
  return { status: res.status(), body: (await res.json()) as ExecutionListResponse };
}

function buildWorkflow(
  id: string,
  name: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowDefinition {
  return { id, name, nodes, edges };
}

const sel = {
  workflowTab: (page: Page) => page.locator('[data-test-id="workflow-tab"]'),
  chatTab: (page: Page) => page.locator('[data-test-id="chat-tab"]'),
  workflowPanel: (page: Page) => page.locator('[data-test-id="workflow-panel"]'),
  node: (page: Page, nodeId: string) => page.locator(`[data-test-id="workflow-node-${nodeId}"]`),
};

// ─── Group 1: Every group always has a workflow ──────────
//
// These tests assert the new invariant introduced by the workflow-first
// refactor: a freshly-created group MUST already have a workflow attached
// (auto-provisioned by the backend). The current implementation returns
// 404 for groups without an explicit PUT, so these tests will fail until
// the backend is changed to return a default workflow.

test.describe('Workflow-first: every group has a workflow', () => {
  test('Test 1.1: GET workflow on a brand-new group returns 200 with default workflow', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF1Grp'));

    const { status, body } = await getWorkflowViaAPI(request, group.id);

    // REQUIRES IMPLEMENTATION: backend must auto-provision a default workflow
    // for newly created groups instead of returning 404.
    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body!.id).toBeTruthy();
    expect(body!.name).toBeTruthy();
    expect(Array.isArray(body!.nodes)).toBe(true);
    expect(Array.isArray(body!.edges)).toBe(true);
    expect(body!.nodes.length).toBeGreaterThanOrEqual(1);
  });

  test('Test 1.2: default workflow exposes a triggers array with a user-message trigger', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF1TrigGrp'));

    const { body } = await getWorkflowViaAPI(request, group.id);

    // REQUIRES IMPLEMENTATION: workflow DTO must include a `triggers` array
    // describing what events kick off this workflow. The default workflow
    // must declare a 'user-message' trigger so chat messages start it.
    expect(body).not.toBeNull();
    expect(Array.isArray(body!.triggers)).toBe(true);
    expect(body!.triggers!.length).toBeGreaterThanOrEqual(1);
    expect(body!.triggers!.some(t => t.type === 'user-message')).toBe(true);
  });

  test('Test 1.3: default workflow exposes a numeric version field', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF1VerGrp'));

    const { body } = await getWorkflowViaAPI(request, group.id);

    // REQUIRES IMPLEMENTATION: workflow DTO must include a numeric `version`
    // field (>= 0) used for optimistic concurrency / change detection.
    expect(body).not.toBeNull();
    expect(typeof body!.version).toBe('number');
    expect(body!.version!).toBeGreaterThanOrEqual(0);
  });

  test('Test 1.4: PUT workflow increments the version', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF1IncGrp'));
    const agent = await createAgentViaAPI(request, uid('Agt'), 'Worker', '🤖');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const before = await getWorkflowViaAPI(request, group.id);
    expect(before.body).not.toBeNull();
    const v1 = before.body!.version ?? 0;

    const replacement = buildWorkflow(uid('wf-inc'), 'Replacement', [
      { id: 'agent1', type: 'agent', agentId: agent.id },
    ], []);
    await putWorkflowViaAPI(request, group.id, replacement);

    const after = await getWorkflowViaAPI(request, group.id);
    // REQUIRES IMPLEMENTATION: PUT must bump version field.
    expect(after.body).not.toBeNull();
    expect(typeof after.body!.version).toBe('number');
    expect(after.body!.version!).toBeGreaterThan(v1);
  });

  test('Test 1.5: custom workflow replaces the default but preserves mandatory fields', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF1ReplGrp'));
    const agent1 = await createAgentViaAPI(request, uid('A'), 'a', '🅰️');
    const agent2 = await createAgentViaAPI(request, uid('B'), 'b', '🅱️');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);
    await addAgentToGroupViaAPI(request, group.id, agent2.id);

    const customId = uid('wf-custom');
    const custom = buildWorkflow(customId, 'My custom flow', [
      { id: 'agent1', type: 'agent', agentId: agent1.id },
      { id: 'agent2', type: 'agent', agentId: agent2.id },
    ], [
      { fromNodeId: 'agent1', toNodeId: 'agent2' },
    ]);

    await putWorkflowViaAPI(request, group.id, custom);

    const { body } = await getWorkflowViaAPI(request, group.id);
    expect(body).not.toBeNull();
    expect(body!.id).toBe(customId);
    expect(body!.name).toBe('My custom flow');
    expect(body!.nodes.map(n => n.id).sort()).toEqual(['agent1', 'agent2']);
    expect(body!.edges).toHaveLength(1);
    expect(body!.edges[0]).toMatchObject({ fromNodeId: 'agent1', toNodeId: 'agent2' });

    // Mandatory fields still present after replacement.
    // REQUIRES IMPLEMENTATION: PUT response / subsequent GET must keep
    // triggers + version even when a user-supplied workflow omits them.
    expect(Array.isArray(body!.triggers)).toBe(true);
    expect(typeof body!.version).toBe('number');
  });
});

// ─── Group 2: Message triggers workflow execution ─────────

test.describe('Workflow-first: messages trigger workflow execution', () => {
  test('Test 2.1: sending a message creates a workflow execution', async ({ request }) => {
    test.setTimeout(90_000);

    const group = await createGroupViaAPI(request, uid('WF2ExecGrp'));
    const agent = await createAgentViaAPI(request, uid('Responder'), 'Answers questions', '💬');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await sendMessageViaAPI(request, group.id, 'Tester', uid('Hello'));

    // Poll either the (new) executions list or the current execution view.
    // REQUIRES IMPLEMENTATION: chat messages must enqueue a workflow execution
    // via the user-message trigger.
    const start = Date.now();
    let saw = false;
    while (Date.now() - start < 30_000) {
      const list = await getExecutionsListViaAPI(request, group.id);
      if (list.status === 200 && list.body) {
        const total = list.body.active.length + list.body.history.length;
        if (total >= 1) { saw = true; break; }
      }
      const current = await getCurrentExecutionViaAPI(request, group.id);
      if (current) { saw = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    expect(saw, 'Expected a workflow execution to be created after sending a message').toBe(true);
  });

  test('Test 2.2: agent response still arrives in messages after workflow-first change (regression)', async ({ request }) => {
    test.setTimeout(120_000);

    const group = await createGroupViaAPI(request, uid('WF2RegGrp'));
    const agentName = uid('RegAgent');
    const agent = await createAgentViaAPI(request, agentName, 'Always replies briefly', '🗣️');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await sendMessageViaAPI(request, group.id, 'Tester', uid('Ping'));

    // Functional regression: the agent must still produce a reply that lands
    // in the group's message stream, even though delivery is now driven by
    // the auto-provisioned workflow rather than direct dispatch.
    const start = Date.now();
    let agentReplied = false;
    while (Date.now() - start < 90_000) {
      const messages = await getMessagesViaAPI(request, group.id);
      if (messages.some(m => m.senderName === agentName)) { agentReplied = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    expect(agentReplied, `Expected agent "${agentName}" to reply via workflow execution`).toBe(true);
  });

  test('Test 2.3: the triggered execution eventually completes', async ({ request }) => {
    test.setTimeout(120_000);

    const group = await createGroupViaAPI(request, uid('WF2DoneGrp'));
    const agent = await createAgentViaAPI(request, uid('Finisher'), 'Replies once and stops', '✅');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await sendMessageViaAPI(request, group.id, 'Tester', uid('Question'));

    const start = Date.now();
    let completed = false;
    while (Date.now() - start < 90_000) {
      const list = await getExecutionsListViaAPI(request, group.id);
      if (list.status === 200 && list.body) {
        const all = [...list.body.active, ...list.body.history];
        if (all.length > 0 && all.every(e => e.completed)) { completed = true; break; }
        if (list.body.history.some(e => e.completed)) { completed = true; break; }
      } else {
        const current = await getCurrentExecutionViaAPI(request, group.id);
        if (current?.completed) { completed = true; break; }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    // REQUIRES IMPLEMENTATION: triggered execution must reach completed=true.
    expect(completed, 'Expected at least one execution for the group to complete').toBe(true);
  });
});

// ─── Group 3: Workflow tab visibility ─────────────────────

test.describe('Workflow-first: workflow tab visibility', () => {
  test('Test 3.1: default single-node workflow does NOT show the workflow tab', async ({ page, request }) => {
    test.setTimeout(60_000);

    const groupName = uid('WF3HiddenGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, uid('Solo'), 'Single agent', '🤖');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await waitForApp(page);
    await page.getByText(groupName).click();

    // REQUIRES IMPLEMENTATION: the UI must hide the workflow tab while the
    // group is still on its trivial auto-provisioned workflow. A user-supplied
    // multi-node workflow is the trigger that reveals the tab.
    await expect(sel.workflowTab(page)).toHaveCount(0);

    // Chat must still function (placeholder = chat input present).
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wf-first-tab-hidden.png`, fullPage: true });
  });

  test('Test 3.2: custom multi-node workflow DOES show the workflow tab', async ({ page, request }) => {
    test.setTimeout(60_000);

    const groupName = uid('WF3VisibleGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent1 = await createAgentViaAPI(request, uid('A'), 'first', '🅰️');
    const agent2 = await createAgentViaAPI(request, uid('B'), 'second', '🅱️');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);
    await addAgentToGroupViaAPI(request, group.id, agent2.id);

    const wf = buildWorkflow(uid('wf-multi'), 'Multi-node', [
      { id: 'agent1', type: 'agent', agentId: agent1.id },
      { id: 'agent2', type: 'agent', agentId: agent2.id },
    ], [{ fromNodeId: 'agent1', toNodeId: 'agent2' }]);
    await putWorkflowViaAPI(request, group.id, wf);

    await waitForApp(page);
    await page.getByText(groupName).click();

    await expect(sel.workflowTab(page)).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wf-first-tab-visible.png`, fullPage: true });
  });
});

// ─── Group 4: Broadcast node type ─────────────────────────

test.describe('Workflow-first: broadcast node type', () => {
  test('Test 4.1: default workflow uses a broadcast node', async ({ request }) => {
    test.setTimeout(60_000);

    const group = await createGroupViaAPI(request, uid('WF4BcastGrp'));
    const agent = await createAgentViaAPI(request, uid('BcastAgt'), 'Listener', '📡');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const { body } = await getWorkflowViaAPI(request, group.id);

    // REQUIRES IMPLEMENTATION: the auto-provisioned default workflow uses a
    // single 'broadcast' node that fans out the trigger message to every
    // agent in the group.
    expect(body).not.toBeNull();
    const types = body!.nodes.map(n => n.type);
    expect(types).toContain('broadcast');
  });

  test('Test 4.2: broadcast node delivers the message to multiple agents', async ({ request }) => {
    test.setTimeout(180_000);

    const group = await createGroupViaAPI(request, uid('WF4MultiGrp'));
    const agent1Name = uid('BcastA1');
    const agent2Name = uid('BcastA2');
    const agent1 = await createAgentViaAPI(request, agent1Name, 'Always says hi', '1️⃣');
    const agent2 = await createAgentViaAPI(request, agent2Name, 'Always says hello', '2️⃣');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);
    await addAgentToGroupViaAPI(request, group.id, agent2.id);

    await sendMessageViaAPI(request, group.id, 'Tester', uid('Greet all'));

    const start = Date.now();
    let bothReplied = false;
    while (Date.now() - start < 150_000) {
      const messages = await getMessagesViaAPI(request, group.id);
      const a1 = messages.some(m => m.senderName === agent1Name);
      const a2 = messages.some(m => m.senderName === agent2Name);
      if (a1 && a2) { bothReplied = true; break; }
      await new Promise(r => setTimeout(r, 1500));
    }
    // REQUIRES IMPLEMENTATION: broadcast node must dispatch to all agents.
    expect(bothReplied, 'Expected both agents to reply via the broadcast node').toBe(true);
  });
});

// ─── Group 5: Execution history ───────────────────────────

test.describe('Workflow-first: execution history endpoint', () => {
  test('Test 5.1: GET /api/groups/{id}/executions returns active + history lists', async ({ request }) => {
    test.setTimeout(180_000);

    const group = await createGroupViaAPI(request, uid('WF5HistGrp'));
    const agent = await createAgentViaAPI(request, uid('HistAgt'), 'Replies briefly', '📜');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    // Send first message and wait for it to complete (serial execution).
    await sendMessageViaAPI(request, group.id, 'Tester', uid('First'));
    const firstStart = Date.now();
    while (Date.now() - firstStart < 90_000) {
      const list = await getExecutionsListViaAPI(request, group.id);
      if (list.status === 200 && list.body && list.body.history.length >= 1) break;
      const current = await getCurrentExecutionViaAPI(request, group.id);
      if (current?.completed) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    // Send second message after the first finished — should produce a 2nd execution.
    await sendMessageViaAPI(request, group.id, 'Tester', uid('Second'));

    // REQUIRES IMPLEMENTATION: new endpoint GET /api/groups/{id}/executions
    // returning { active: [...], history: [...] }. Each entry must include
    // executionId and completed, and ideally createdAt + triggeredBy.
    const start = Date.now();
    let list: ExecutionListResponse | null = null;
    while (Date.now() - start < 90_000) {
      const res = await getExecutionsListViaAPI(request, group.id);
      if (res.status === 200 && res.body) {
        const total = res.body.active.length + res.body.history.length;
        if (total >= 2) { list = res.body; break; }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    expect(list, 'Expected /executions to return at least 2 entries after two messages').not.toBeNull();
    expect(Array.isArray(list!.active)).toBe(true);
    expect(Array.isArray(list!.history)).toBe(true);

    const all = [...list!.active, ...list!.history];
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const e of all) {
      expect(e.executionId, 'execution must carry an id').toBeTruthy();
      expect(typeof e.completed).toBe('boolean');
    }
  });
});

// ─── Group 6: HITL prompt cards in chat ───────────────────
//
// Phase 5 introduces inline HITL prompt cards in the chat stream so
// that a human can answer an awaiting_hitl node without leaving the
// chat view. These tests are TDD — they will fail until the chat-side
// HITL card component is built.
//
// REQUIRES IMPLEMENTATION:
//   - When a workflow node of type 'hitl' enters status 'awaiting_hitl',
//     a system message must be appended to the group's message stream
//     with senderName === 'HITL' and content referencing the nodeId
//     and prompt.
//   - The chat view must render an inline card with:
//       data-test-id="hitl-chat-card"
//       data-test-id="hitl-chat-card-prompt"   (shows the configured prompt)
//       data-test-id="hitl-chat-card-input"    (text input)
//       data-test-id="hitl-chat-card-submit"   (submit button)
//   - Submitting the card must POST to the existing
//     /api/groups/{id}/workflow/execution/hitl/{nodeId} endpoint and
//     transition the node to 'done'.

test.describe('Workflow-first: HITL prompt cards in chat', () => {
  test('Test 6.1: HITL awaiting message appears in chat stream', async ({ request }) => {
    test.setTimeout(120_000);

    const group = await createGroupViaAPI(request, uid('WF6HitlMsgGrp'));
    const agent = await createAgentViaAPI(request, uid('PreHitl'), 'Pre-HITL agent', '🧠');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const hitlNodeId = 'hitl_review';
    const promptText = 'Please review and confirm the agent output.';
    const wf = buildWorkflow(
      uid('wf-hitl-msg'),
      'HITL chat message',
      [
        { id: 'agent1', type: 'agent', agentId: agent.id },
        { id: hitlNodeId, type: 'hitl', config: { prompt: promptText } },
      ],
      [{ fromNodeId: 'agent1', toNodeId: hitlNodeId }],
    );
    await putWorkflowViaAPI(request, group.id, wf);

    await executeWorkflowViaAPI(request, group.id);
    await waitForNodeStatus(request, group.id, hitlNodeId, 'awaiting_hitl', 60_000);

    // REQUIRES IMPLEMENTATION: a system message must be emitted on the group
    // message stream when the HITL node reaches awaiting_hitl. It should be
    // identifiable via senderName "HITL" and reference the node id.
    const start = Date.now();
    let hitlMessage: GroupMessage | undefined;
    while (Date.now() - start < 30_000) {
      const messages = await getMessagesViaAPI(request, group.id);
      hitlMessage = messages.find(
        m => m.senderName === 'HITL' && m.content.includes(hitlNodeId),
      );
      if (hitlMessage) break;
      await new Promise(r => setTimeout(r, 500));
    }
    expect(hitlMessage, 'Expected a HITL system message in the chat stream').toBeTruthy();
    expect(hitlMessage!.senderName).toBe('HITL');
    expect(hitlMessage!.content).toContain(hitlNodeId);
  });

  test('Test 6.2: HITL card renders inline in chat view', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WF6HitlCardGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, uid('PreHitl'), 'Pre-HITL agent', '🧠');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const hitlNodeId = 'hitl_card';
    const promptText = 'Approve the next step?';
    const wf = buildWorkflow(
      uid('wf-hitl-card'),
      'HITL card',
      [
        { id: 'agent1', type: 'agent', agentId: agent.id },
        { id: hitlNodeId, type: 'hitl', config: { prompt: promptText } },
      ],
      [{ fromNodeId: 'agent1', toNodeId: hitlNodeId }],
    );
    await putWorkflowViaAPI(request, group.id, wf);

    await executeWorkflowViaAPI(request, group.id);
    await waitForNodeStatus(request, group.id, hitlNodeId, 'awaiting_hitl', 60_000);

    // Navigate to the chat view (NOT the workflow tab).
    await waitForApp(page);
    await page.getByText(groupName).click();

    // REQUIRES IMPLEMENTATION: an inline HITL card in the chat stream.
    const card = page.locator('[data-test-id="hitl-chat-card"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    const cardPrompt = card.locator('[data-test-id="hitl-chat-card-prompt"]');
    await expect(cardPrompt).toBeVisible();
    await expect(cardPrompt).toContainText(promptText);

    await expect(card.locator('[data-test-id="hitl-chat-card-input"]')).toBeVisible();
    await expect(card.locator('[data-test-id="hitl-chat-card-submit"]')).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wf-first-hitl-card.png`, fullPage: true });
  });

  test('Test 6.3: submitting HITL response from chat card completes the node', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WF6HitlSubmitGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, uid('PreHitl'), 'Pre-HITL agent', '🧠');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const hitlNodeId = 'hitl_submit';
    const promptText = 'Confirm to proceed.';
    const wf = buildWorkflow(
      uid('wf-hitl-submit'),
      'HITL submit',
      [
        { id: 'agent1', type: 'agent', agentId: agent.id },
        { id: hitlNodeId, type: 'hitl', config: { prompt: promptText } },
      ],
      [{ fromNodeId: 'agent1', toNodeId: hitlNodeId }],
    );
    await putWorkflowViaAPI(request, group.id, wf);

    await executeWorkflowViaAPI(request, group.id);
    await waitForNodeStatus(request, group.id, hitlNodeId, 'awaiting_hitl', 60_000);

    await waitForApp(page);
    await page.getByText(groupName).click();

    // REQUIRES IMPLEMENTATION: submitting the inline card must call the
    // existing HITL submit endpoint and transition the node to 'done'.
    const card = page.locator('[data-test-id="hitl-chat-card"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    const humanReply = 'Approved from chat card';
    await card.locator('[data-test-id="hitl-chat-card-input"]').fill(humanReply);
    await card.locator('[data-test-id="hitl-chat-card-submit"]').click();

    // The card should disappear or otherwise stop being interactive.
    await expect(card.locator('[data-test-id="hitl-chat-card-submit"]')).toHaveCount(0, {
      timeout: 30_000,
    });

    // Verify via the API that the HITL node is now done.
    await waitForNodeStatus(request, group.id, hitlNodeId, 'done', 60_000);
  });

  test('Test 6.4: HITL card shows predecessor context', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WF6CtxGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, uid('CtxAgent'), 'Always responds with a clear answer', '🧠');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const wf = buildWorkflow(uid('wf-ctx'), 'Context test', [
      { id: 'agent1', type: 'agent', agentId: agent.id },
      { id: 'hitl1', type: 'hitl', config: { prompt: 'Review the agent output above and approve.' } },
    ], [{ fromNodeId: 'agent1', toNodeId: 'hitl1' }]);
    await putWorkflowViaAPI(request, group.id, wf);

    await executeWorkflowViaAPI(request, group.id, 'Tell me about cats');
    await waitForNodeStatus(request, group.id, 'hitl1', 'awaiting_hitl', 60_000);

    // Verify agent1 has a result
    const exec = await getCurrentExecutionViaAPI(request, group.id);
    expect(exec).not.toBeNull();
    expect(exec!.nodeStates.agent1.status).toBe('done');
    expect(exec!.nodeStates.agent1.result).toBeTruthy();

    // Navigate to chat view
    await waitForApp(page);
    await page.getByText(groupName).click();

    // HITL card should show predecessor context
    const card = page.locator('[data-test-id="hitl-chat-card"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Predecessor context section should be visible with agent output
    const context = card.locator('[data-test-id="hitl-predecessor-context"]');
    await expect(context).toBeVisible({ timeout: 10_000 });

    // Should contain some text from the agent's response
    await expect(context).not.toBeEmpty();

    // Should show the predecessor node identifier
    const predBlock = card.locator('[data-test-id="hitl-predecessor-agent1"]');
    await expect(predBlock).toBeVisible();
  });
});
