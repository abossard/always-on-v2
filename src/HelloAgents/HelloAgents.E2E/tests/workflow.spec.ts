import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ─── Configuration ────────────────────────────────────────
// API base URL — same logic as chat.spec.ts
const apiBaseURL = process.env.services__api__http__0
  ?? process.env.PRODUCTION_API_URL
  ?? 'http://localhost:5100';

const SCREENSHOT_DIR = 'screenshots';

// Statuses produced by the backend (see Domain.cs NodeExecutionState)
type NodeStatus = 'pending' | 'running' | 'awaiting_hitl' | 'done' | 'failed';

// ─── Types matching backend DTOs ──────────────────────────
interface WorkflowNode {
  id: string;
  type: 'agent' | 'hitl' | 'tool';
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

// ─── Helpers (reuse pattern from chat.spec.ts) ────────────

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

async function putWorkflowViaAPI(
  request: APIRequestContext,
  groupId: string,
  workflow: WorkflowDefinition,
) {
  const res = await request.put(`${apiBaseURL}/api/groups/${groupId}/workflow`, {
    data: { workflow },
  });
  expect(res.ok(), `PUT workflow failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as WorkflowDefinition;
}

async function executeWorkflowViaAPI(
  request: APIRequestContext,
  groupId: string,
  input?: string,
) {
  const res = await request.post(`${apiBaseURL}/api/groups/${groupId}/workflow/execute`, {
    data: { input: input ?? null },
  });
  expect(res.status(), `Execute workflow failed: ${await res.text()}`).toBe(202);
  return (await res.json()) as { executionId: string };
}

async function getWorkflowExecutionViaAPI(
  request: APIRequestContext,
  groupId: string,
): Promise<WorkflowExecutionView | null> {
  const res = await request.get(`${apiBaseURL}/api/groups/${groupId}/workflow/execution`);
  if (res.status() === 404) return null;
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as WorkflowExecutionView;
}

async function submitHitlViaAPI(
  request: APIRequestContext,
  groupId: string,
  nodeId: string,
  response: string,
) {
  const res = await request.post(
    `${apiBaseURL}/api/groups/${groupId}/workflow/execution/hitl/${nodeId}`,
    { data: { response } },
  );
  expect(res.ok(), `Submit HITL failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/** Poll the execution endpoint until a node reaches `status` (or timeout). */
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
    const view = await getWorkflowExecutionViaAPI(request, groupId);
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

/** Poll until the entire execution completes. */
async function waitForExecutionCompleted(
  request: APIRequestContext,
  groupId: string,
  timeoutMs = 90_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const view = await getWorkflowExecutionViaAPI(request, groupId);
    if (view?.completed) return view;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for workflow execution to complete on group ${groupId}`);
}

/** Build a workflow definition with the given nodes/edges. */
function buildWorkflow(
  id: string,
  name: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowDefinition {
  return { id, name, nodes, edges };
}

/** Locator helpers — all UI assertions go through data-test-id / data-* attributes. */
const sel = {
  workflowTab: (page: Page) => page.locator('[data-test-id="workflow-tab"]'),
  chatTab: (page: Page) => page.locator('[data-test-id="chat-tab"]'),
  workflowPanel: (page: Page) => page.locator('[data-test-id="workflow-panel"]'),
  workflowRunBtn: (page: Page) => page.locator('[data-test-id="workflow-run-btn"]'),
  node: (page: Page, nodeId: string) => page.locator(`[data-test-id="workflow-node-${nodeId}"]`),
  edge: (page: Page, fromId: string, toId: string) =>
    page.locator(`[data-test-id="workflow-edge-${fromId}-${toId}"]`),
  hitlForm: (page: Page) => page.locator('[data-test-id="hitl-form"]'),
  hitlInput: (page: Page) => page.locator('[data-test-id="hitl-input"]'),
  hitlSubmit: (page: Page) => page.locator('[data-test-id="hitl-submit"]'),
  nodeDetails: (page: Page) => page.locator('[data-test-id="node-details"]'),
};

/** Open a group in the UI and switch to the workflow tab. */
async function openGroupAndWorkflowTab(page: Page, groupName: string) {
  await waitForApp(page);
  await page.getByText(groupName).click();
  await expect(sel.workflowTab(page)).toBeVisible({ timeout: 10_000 });
  await sel.workflowTab(page).click();
  await expect(sel.workflowPanel(page)).toBeVisible();
}

/** Wait for a node wrapper element to display the given data-status. */
async function expectNodeStatus(
  page: Page,
  nodeId: string,
  status: NodeStatus,
  timeoutMs = 60_000,
) {
  await expect(sel.node(page, nodeId)).toHaveAttribute('data-status', status, { timeout: timeoutMs });
}

// ─── Tests ────────────────────────────────────────────────

test.describe('Workflow UI', () => {
  test('Test 1: Workflow tab appears when group has a workflow', async ({ page, request }) => {
    test.setTimeout(60_000);

    const groupName = uid('WfTabGrp');
    const agentName = uid('WfTabAgent');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'Test agent', '🤖');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    // First: enter UI BEFORE a workflow exists — workflow tab must NOT be visible.
    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
    await expect(sel.workflowTab(page)).toHaveCount(0);

    // Now attach a workflow via API.
    const workflow = buildWorkflow(uid('wf'), 'Tab visibility test', [
      { id: 'agent1', type: 'agent', agentId: agent.id },
    ], []);
    await putWorkflowViaAPI(request, group.id, workflow);

    // Either via SSE or a soft reload, the tab must appear.
    await page.reload();
    await waitForApp(page);
    await page.getByText(groupName).click();

    await expect(sel.workflowTab(page)).toBeVisible({ timeout: 10_000 });

    // Clicking it shows the workflow panel.
    await sel.workflowTab(page).click();
    await expect(sel.workflowPanel(page)).toBeVisible();
    await expect(sel.workflowRunBtn(page)).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/workflow-panel-empty.png`, fullPage: true });
  });

  test('Test 2: Workflow DAG renders correctly', async ({ page, request }) => {
    test.setTimeout(60_000);

    const groupName = uid('WfDagGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent1 = await createAgentViaAPI(request, uid('A1'), 'First step', '🅰️');
    const agent2 = await createAgentViaAPI(request, uid('A2'), 'Second step', '🅱️');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);
    await addAgentToGroupViaAPI(request, group.id, agent2.id);

    const workflow = buildWorkflow(
      uid('wf-dag'),
      'DAG render test',
      [
        { id: 'agent1', type: 'agent', agentId: agent1.id },
        { id: 'agent2', type: 'agent', agentId: agent2.id },
        { id: 'hitl1', type: 'hitl', config: { prompt: 'Approve result?' } },
      ],
      [
        { fromNodeId: 'agent1', toNodeId: 'agent2' },
        { fromNodeId: 'agent2', toNodeId: 'hitl1' },
      ],
    );
    await putWorkflowViaAPI(request, group.id, workflow);

    await openGroupAndWorkflowTab(page, groupName);

    // All three node wrappers visible.
    await expect(sel.node(page, 'agent1')).toBeVisible();
    await expect(sel.node(page, 'agent2')).toBeVisible();
    await expect(sel.node(page, 'hitl1')).toBeVisible();

    // Each node exposes its node-type via data-node-type for assertions.
    await expect(sel.node(page, 'agent1')).toHaveAttribute('data-node-type', 'agent');
    await expect(sel.node(page, 'agent2')).toHaveAttribute('data-node-type', 'agent');
    await expect(sel.node(page, 'hitl1')).toHaveAttribute('data-node-type', 'hitl');

    // Node labels — agent nodes show their agent's name; hitl shows a HITL-related label.
    await expect(sel.node(page, 'agent1')).toContainText(agent1.name);
    await expect(sel.node(page, 'agent2')).toContainText(agent2.name);
    await expect(sel.node(page, 'hitl1')).toContainText(/human|hitl|approve/i);

    // Initial status before any execution = pending.
    await expect(sel.node(page, 'agent1')).toHaveAttribute('data-status', 'pending');
    await expect(sel.node(page, 'agent2')).toHaveAttribute('data-status', 'pending');
    await expect(sel.node(page, 'hitl1')).toHaveAttribute('data-status', 'pending');

    // Edges connect the nodes in order.
    await expect(sel.edge(page, 'agent1', 'agent2')).toBeAttached();
    await expect(sel.edge(page, 'agent2', 'hitl1')).toBeAttached();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/workflow-dag-display.png`, fullPage: true });
  });

  test('Test 3: Workflow execution — live status updates', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WfRunGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent1 = await createAgentViaAPI(request, uid('Runner1'), 'Step 1', '1️⃣');
    const agent2 = await createAgentViaAPI(request, uid('Runner2'), 'Step 2', '2️⃣');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);
    await addAgentToGroupViaAPI(request, group.id, agent2.id);

    const workflow = buildWorkflow(
      uid('wf-run'),
      'Execution test',
      [
        { id: 'agent1', type: 'agent', agentId: agent1.id },
        { id: 'agent2', type: 'agent', agentId: agent2.id },
      ],
      [{ fromNodeId: 'agent1', toNodeId: 'agent2' }],
    );
    await putWorkflowViaAPI(request, group.id, workflow);

    await openGroupAndWorkflowTab(page, groupName);

    // Both nodes start in pending.
    await expectNodeStatus(page, 'agent1', 'pending', 5_000);
    await expectNodeStatus(page, 'agent2', 'pending', 5_000);

    // Trigger execution via the UI Run button.
    await sel.workflowRunBtn(page).click();

    // Node 1 should leave the pending state — driven by SSE.
    await expect(sel.node(page, 'agent1')).not.toHaveAttribute('data-status', 'pending', {
      timeout: 30_000,
    });
    // Both nodes eventually reach done.
    await expectNodeStatus(page, 'agent1', 'done', 60_000);
    await expectNodeStatus(page, 'agent2', 'done', 60_000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/workflow-execution-complete.png`, fullPage: true });
  });

  test('Test 4: HITL interaction', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WfHitlGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent1 = await createAgentViaAPI(request, uid('HitlAgent'), 'Pre-HITL agent', '🧠');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);

    const workflow = buildWorkflow(
      uid('wf-hitl'),
      'HITL test',
      [
        { id: 'agent1', type: 'agent', agentId: agent1.id },
        { id: 'hitl1', type: 'hitl', config: { prompt: 'Please review and confirm.' } },
      ],
      [{ fromNodeId: 'agent1', toNodeId: 'hitl1' }],
    );
    await putWorkflowViaAPI(request, group.id, workflow);

    await openGroupAndWorkflowTab(page, groupName);

    // Trigger execution from the UI.
    await sel.workflowRunBtn(page).click();

    // Wait until hitl node is awaiting human input (verify both via API and UI).
    await waitForNodeStatus(request, group.id, 'hitl1', 'awaiting_hitl', 60_000);
    await expectNodeStatus(page, 'hitl1', 'awaiting_hitl', 30_000);

    // The HITL node should advertise it is awaiting input via a data attribute.
    const hitlNode = sel.node(page, 'hitl1');
    await expect(hitlNode).toHaveAttribute('data-awaiting-hitl', 'true');

    // Click the HITL node — the side panel must surface the prompt + a form.
    await hitlNode.click();
    await expect(sel.hitlForm(page)).toBeVisible();
    await expect(sel.hitlForm(page)).toContainText('Please review and confirm.');
    await expect(sel.hitlInput(page)).toBeVisible();
    await expect(sel.hitlSubmit(page)).toBeVisible();

    // Submit a response through the UI.
    const humanReply = 'Approved by E2E test';
    await sel.hitlInput(page).fill(humanReply);
    await sel.hitlSubmit(page).click();

    // After submit the node should transition out of awaiting_hitl into done.
    await expect(hitlNode).not.toHaveAttribute('data-status', 'awaiting_hitl', { timeout: 30_000 });
    await expectNodeStatus(page, 'hitl1', 'done', 60_000);

    // And the workflow as a whole should complete.
    await waitForExecutionCompleted(request, group.id, 60_000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/workflow-hitl-completed.png`, fullPage: true });

    // Reference the API helper so it isn't flagged as unused — alternative submit path.
    void submitHitlViaAPI;
  });

  test('Test 5: Node details panel shows result for completed node', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('WfDetailsGrp');
    const group = await createGroupViaAPI(request, groupName);
    const agent1 = await createAgentViaAPI(request, uid('Detail1'), 'Produces result', '📦');
    await addAgentToGroupViaAPI(request, group.id, agent1.id);

    const workflow = buildWorkflow(
      uid('wf-details'),
      'Node details test',
      [{ id: 'agent1', type: 'agent', agentId: agent1.id }],
      [],
    );
    await putWorkflowViaAPI(request, group.id, workflow);

    // Run execution via API for determinism, then verify UI surfaces the result.
    await executeWorkflowViaAPI(request, group.id);
    await waitForNodeStatus(request, group.id, 'agent1', 'done', 90_000);
    const view = await getWorkflowExecutionViaAPI(request, group.id);
    const nodeResult = view?.nodeStates?.agent1?.result ?? '';

    await openGroupAndWorkflowTab(page, groupName);
    await expectNodeStatus(page, 'agent1', 'done', 30_000);

    // Click the done node — the details panel reveals its result text.
    await sel.node(page, 'agent1').click();
    const details = sel.nodeDetails(page);
    await expect(details).toBeVisible();
    await expect(details).toHaveAttribute('data-node-id', 'agent1');
    await expect(details).toContainText('done');
    if (nodeResult) {
      // Result text from the executor must surface in the details panel.
      await expect(details).toContainText(nodeResult.slice(0, 40));
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/workflow-node-details.png`, fullPage: true });
  });
});
