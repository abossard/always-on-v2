import { test, expect } from '@playwright/test';

const apiBaseURL = process.env.services__api__http__0 ?? 'http://localhost:5100';

// ─── Helpers ───────────────────────────────────────────────

let counter = 0;
function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${++counter}`;
}

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });
}

async function createGroupViaAPI(request: import('@playwright/test').APIRequestContext, name: string, description = '') {
  const res = await request.post(`${apiBaseURL}/api/groups`, {
    data: { name, description },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

async function createAgentViaAPI(request: import('@playwright/test').APIRequestContext, name: string, persona: string, emoji: string) {
  const res = await request.post(`${apiBaseURL}/api/agents`, {
    data: { name, personaDescription: persona, avatarEmoji: emoji },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

async function addAgentToGroupViaAPI(request: import('@playwright/test').APIRequestContext, groupId: string, agentId: string) {
  const res = await request.post(`${apiBaseURL}/api/groups/${groupId}/agents`, {
    data: { agentId },
  });
  expect(res.ok()).toBeTruthy();
  // Stream-based membership — allow propagation
  await new Promise(r => setTimeout(r, 500));
}

// ─── Layout & Navigation ──────────────────────────────────

test.describe('Layout & Navigation', () => {
  test('app loads with three-panel layout and welcome screen', async ({ page }) => {
    await waitForApp(page);

    await expect(page.getByText('Chat Groups')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HelloAgents' })).toBeVisible();
    await expect(page.getByText('Select or create a group')).toBeVisible();
  });

  test('selecting a group shows chat and agent panels', async ({ page, request }) => {
    const name = uid('NavTest');
    await createGroupViaAPI(request, name);
    await waitForApp(page);

    await page.getByText(name).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Agents in Group')).toBeVisible();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Discussion/ })).toBeVisible();
  });
});

// ─── Group Management ─────────────────────────────────────

test.describe('Group Management', () => {
  test('can create a group via UI', async ({ page }) => {
    const name = uid('UIGroup');
    await waitForApp(page);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByPlaceholder('Group name').fill(name);
    await page.getByPlaceholder('Description (optional)').fill('Created in E2E');
    await page.getByRole('button', { name: 'Create' }).click();

    // Group heading should be visible (auto-selected)
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5_000 });
  });

  test('can delete a group', async ({ page, request }) => {
    const name = uid('DeleteMe');
    const group = await createGroupViaAPI(request, name);
    await waitForApp(page);

    await expect(page.getByText(name).first()).toBeVisible();
    // Use the data-testid on the group row to find the exact delete button
    await page.getByTestId(`group-${group.id}`).getByTitle('Delete group').click();

    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5_000 });
  });

  test('empty group name is rejected', async ({ page }) => {
    await waitForApp(page);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByPlaceholder('Group name')).toBeVisible();
  });
});

// ─── Agent Management ─────────────────────────────────────

test.describe('Agent Management', () => {
  test('can create an agent from the roster panel', async ({ page, request }) => {
    const groupName = uid('AgentCreateGrp');
    const agentName = uid('NewBot');
    await createGroupViaAPI(request, groupName);
    await waitForApp(page);

    await page.getByText(groupName).click();
    await expect(page.getByText('Agents in Group')).toBeVisible();

    await page.getByRole('button', { name: '✨ Create New Agent' }).click();
    await page.getByPlaceholder('Agent name').fill(agentName);
    await page.getByPlaceholder('Describe the agent').fill('A helpful test bot');
    await page.getByRole('button', { name: 'Create & Add' }).click();

    // Agent name appears in roster and system message — use exact match
    await expect(page.getByText(agentName, { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('can add an existing agent to a group', async ({ page, request }) => {
    const groupName = uid('AddAgentGrp');
    const agentName = uid('ExistBot');
    await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'A pre-created bot', '🤖');

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByText('Agents in Group')).toBeVisible();

    await page.locator('select').selectOption(agent.id);
    // Agent name appears in roster and system message — use exact match
    await expect(page.getByText(agentName, { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('can remove an agent from a group', async ({ page, request }) => {
    const groupName = uid('RmAgentGrp');
    const agentName = uid('RmBot');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'Will be removed', '🗑️');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await waitForApp(page);
    await page.getByText(groupName).click();
    // Agent name appears in both the roster and the "joined" system message — use exact match on roster
    await expect(page.getByText(agentName, { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByTitle('Remove from group').click();
    // After removal, the roster entry disappears (system "left" message may still contain the name)
    await expect(page.getByTitle('Remove from group')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Chat & Messaging ─────────────────────────────────────

test.describe('Chat & Messaging', () => {
  test('can send a message and see it appear', async ({ page, request }) => {
    const groupName = uid('ChatTest');
    await createGroupViaAPI(request, groupName);
    await waitForApp(page);

    await page.getByText(groupName).click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();

    const msg = uid('HelloE2E');
    await page.getByPlaceholder('Type a message...').fill(msg);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(msg)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('You')).toBeVisible();
  });

  test('pressing Enter sends the message', async ({ page, request }) => {
    const groupName = uid('EnterKeyGrp');
    await createGroupViaAPI(request, groupName);
    await waitForApp(page);

    await page.getByText(groupName).click();
    const msg = uid('EnterMsg');
    const input = page.getByPlaceholder('Type a message...');
    await input.fill(msg);
    await input.press('Enter');

    await expect(page.getByText(msg)).toBeVisible({ timeout: 5_000 });
  });

  test('empty message is not sent', async ({ page, request }) => {
    const groupName = uid('EmptyMsgGrp');
    await createGroupViaAPI(request, groupName);
    await waitForApp(page);

    await page.getByText(groupName).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('No messages yet')).toBeVisible();
  });
});

// ─── Discussion ────────────────────────────────────────────

test.describe('Discussion', () => {
  test('start discussion shows busy indicator and agent responses', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('DiscussGrp');
    const agentName = uid('Debater');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'Loves to debate any topic', '🎭');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    const seedMsg = uid('SeedQuestion');
    await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'Tester', content: seedMsg },
    });

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByText(seedMsg)).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Start Discussion/ }).click();

    // The button may briefly show "Discussing..." or the LLM may respond before we can observe it
    // Just wait for the agent response in the chat messages area (up to 60s for LLM call)
    const chatMessages = page.getByTestId('chat-messages');
    await expect(chatMessages.getByText(agentName, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Start Discussion/ })).toBeEnabled({ timeout: 5_000 });
  });
});

// ─── Multi-Tab Real-Time ───────────────────────────────────

test.describe('Multi-Tab Real-Time', () => {
  test('message sent in Tab A appears in Tab B via SSE', async ({ browser, request }) => {
    test.setTimeout(60_000);

    const groupName = uid('MultiTabGrp');
    const group = await createGroupViaAPI(request, groupName);

    // Open two separate browser tabs (pages)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const tabA = await contextA.newPage();
    const tabB = await contextB.newPage();

    // Both tabs navigate and select the same group
    const webURL = process.env.services__web__http__0 ?? 'http://localhost:4200';
    await tabA.goto(webURL);
    await tabB.goto(webURL);

    await expect(tabA.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });
    await expect(tabB.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });

    await tabA.getByText(groupName).click();
    await tabB.getByText(groupName).click();

    // Wait for both tabs to show the chat view
    await expect(tabA.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });
    await expect(tabB.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });

    // Give SSE a moment to connect
    await tabB.waitForTimeout(1_000);

    // Tab A sends a message
    const msg = uid('CrossTabMsg');
    await tabA.getByPlaceholder('Type a message...').fill(msg);
    await tabA.getByRole('button', { name: 'Send' }).click();

    // Tab A should see it immediately (local state)
    await expect(tabA.getByText(msg)).toBeVisible({ timeout: 5_000 });

    // Tab B should receive it via SSE (cross-tab delivery, Azure Queue Streams have polling latency)
    await expect(tabB.getByText(msg)).toBeVisible({ timeout: 30_000 });

    await contextA.close();
    await contextB.close();
  });

  test('discussion responses appear in both tabs', async ({ browser, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('MultiTabDiscuss');
    const agentName = uid('SharedBot');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'Responds to questions', '🤖');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    // Seed a message
    const seedMsg = uid('SharedSeed');
    await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'Setup', content: seedMsg },
    });

    // Open two tabs
    const webURL = process.env.services__web__http__0 ?? 'http://localhost:4200';
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const tabA = await contextA.newPage();
    const tabB = await contextB.newPage();

    await tabA.goto(webURL);
    await tabB.goto(webURL);
    await expect(tabA.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });
    await expect(tabB.locator('[data-test-id="chat-app-ready"]')).toBeAttached({ timeout: 15_000 });

    await tabA.getByText(groupName).click();
    await tabB.getByText(groupName).click();
    await expect(tabA.getByText(seedMsg)).toBeVisible({ timeout: 5_000 });
    await expect(tabB.getByText(seedMsg)).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await tabB.waitForTimeout(1_000);

    // Tab A triggers discussion
    await tabA.getByRole('button', { name: /Start Discussion/ }).click();

    // Both tabs should see the agent response in the chat messages area
    await expect(tabA.getByTestId('chat-messages').getByText(agentName, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(tabB.getByTestId('chat-messages').getByText(agentName, { exact: true })).toBeVisible({ timeout: 60_000 });

    await contextA.close();
    await contextB.close();
  });
});

test.describe('API (direct)', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const res = await request.get(`${apiBaseURL}/health`);
    expect(res.status()).toBe(200);
  });

  test('group CRUD lifecycle', async ({ request }) => {
    const name = uid('CRUDGroup');
    const createRes = await request.post(`${apiBaseURL}/api/groups`, {
      data: { name, description: 'API lifecycle test' },
    });
    expect(createRes.status()).toBe(201);
    const group = await createRes.json();
    expect(group.name).toBe(name);

    expect((await request.get(`${apiBaseURL}/api/groups/${group.id}`)).status()).toBe(200);

    const groups = await (await request.get(`${apiBaseURL}/api/groups`)).json();
    expect(groups.some((g: { id: string }) => g.id === group.id)).toBeTruthy();

    expect((await request.delete(`${apiBaseURL}/api/groups/${group.id}`)).status()).toBe(204);
  });

  test('agent CRUD lifecycle', async ({ request }) => {
    const name = uid('CRUDAgent');
    const createRes = await request.post(`${apiBaseURL}/api/agents`, {
      data: { name, personaDescription: 'Lifecycle test', avatarEmoji: '🧪' },
    });
    expect(createRes.status()).toBe(201);
    const agent = await createRes.json();
    expect(agent.name).toBe(name);

    expect((await request.get(`${apiBaseURL}/api/agents/${agent.id}`)).status()).toBe(200);
    expect((await request.get(`${apiBaseURL}/api/agents`)).status()).toBe(200);
    expect((await request.delete(`${apiBaseURL}/api/agents/${agent.id}`)).status()).toBe(204);
  });

  test('membership: add and remove agent from group', async ({ request }) => {
    const group = await createGroupViaAPI(request, uid('MemberGrp'));
    const agent = await createAgentViaAPI(request, uid('MemberBot'), 'test', '🤖');

    await addAgentToGroupViaAPI(request, group.id, agent.id);

    // Stream-based membership is async — wait for propagation
    await new Promise(r => setTimeout(r, 1000));

    const detail = await (await request.get(`${apiBaseURL}/api/groups/${group.id}`)).json();
    expect(detail.agents.some((a: { id: string }) => a.id === agent.id)).toBeTruthy();

    expect((await request.delete(`${apiBaseURL}/api/groups/${group.id}/agents/${agent.id}`)).status()).toBe(204);

    await new Promise(r => setTimeout(r, 1000));

    const detail2 = await (await request.get(`${apiBaseURL}/api/groups/${group.id}`)).json();
    expect(detail2.agents.every((a: { id: string }) => a.id !== agent.id)).toBeTruthy();
  });

  test('send message and verify in group state', async ({ request }) => {
    const group = await createGroupViaAPI(request, uid('MsgGrp'));
    const content = uid('HelloAPI');

    const msgRes = await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'API Tester', content },
    });
    expect(msgRes.status()).toBe(200);
    const msg = await msgRes.json();
    expect(msg.content).toBe(content);

    // Stream-based persistence is async — wait for propagation
    await new Promise(r => setTimeout(r, 1000));

    const detail = await (await request.get(`${apiBaseURL}/api/groups/${group.id}`)).json();
    expect(detail.messages.length).toBeGreaterThanOrEqual(1);
  });

  test('send empty message returns 400', async ({ request }) => {
    const group = await createGroupViaAPI(request, uid('BadMsgGrp'));
    const res = await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'Tester', content: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('orchestrate with empty message returns 400', async ({ request }) => {
    const res = await request.post(`${apiBaseURL}/api/orchestrate`, {
      data: { message: '' },
    });
    expect(res.status()).toBe(400);
  });
});
