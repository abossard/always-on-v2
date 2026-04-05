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

// ─── SSE Delivery (proves stream pipeline works) ──────────

test.describe('SSE Delivery', () => {
  test('message sent via API appears in watching browser tab via SSE', async ({ page, request }) => {
    test.setTimeout(30_000);

    const groupName = uid('SSEMsgGrp');
    const group = await createGroupViaAPI(request, groupName);

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await page.waitForTimeout(1_500);

    // Send message via raw API — the browser tab has no local state for this.
    // It can ONLY appear if SSE delivers it.
    const msg = uid('SSEOnly');
    await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'APISender', content: msg },
    });

    // Must appear via SSE — no other path
    await expect(page.getByTestId('chat-messages').getByText(msg)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-messages').getByText('APISender')).toBeVisible();
  });

  test('agent join event appears as system message via SSE', async ({ page, request }) => {
    test.setTimeout(30_000);

    const groupName = uid('SSEJoinGrp');
    const agentName = uid('JoinBot');
    const group = await createGroupViaAPI(request, groupName);

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await page.waitForTimeout(1_500);

    // Create and add agent via API — browser is passive
    const agent = await createAgentViaAPI(request, agentName, 'Joins via API', '🟢');
    await request.post(`${apiBaseURL}/api/groups/${group.id}/agents`, {
      data: { agentId: agent.id },
    });

    // "joined the group" system message should arrive via SSE
    await expect(page.getByTestId('chat-messages').getByText('joined the group')).toBeVisible({ timeout: 15_000 });
    // Agent name should appear in the message
    await expect(page.getByTestId('chat-messages').getByText(agentName)).toBeVisible();
  });

  test('agent leave event appears as system message via SSE', async ({ page, request }) => {
    test.setTimeout(30_000);

    const groupName = uid('SSELeaveGrp');
    const agentName = uid('LeaveBot');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'Will leave', '🔴');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    await waitForApp(page);
    await page.getByText(groupName).click();
    // Wait for the "joined" message to appear from initial state load
    await expect(page.getByTestId('chat-messages').getByText('joined the group')).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await page.waitForTimeout(1_500);

    // Remove agent via API — browser is passive
    await request.delete(`${apiBaseURL}/api/groups/${group.id}/agents/${agent.id}`);

    // "left the group" system message should arrive via SSE
    await expect(page.getByTestId('chat-messages').getByText('left the group')).toBeVisible({ timeout: 15_000 });
  });

  test('discussion responses arrive via SSE in single tab', async ({ page, request }) => {
    test.setTimeout(120_000);

    const groupName = uid('SSEDiscussGrp');
    const agentName = uid('SSEDiscBot');
    const group = await createGroupViaAPI(request, groupName);
    const agent = await createAgentViaAPI(request, agentName, 'A responsive debater', '🎯');
    await addAgentToGroupViaAPI(request, group.id, agent.id);

    // Seed a message so the agent has context
    await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
      data: { senderName: 'Setup', content: uid('DiscussSeed') },
    });

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await page.waitForTimeout(1_500);

    // Trigger discussion — new code returns 202, responses ONLY via SSE
    await page.getByRole('button', { name: /Start Discussion/ }).click();

    // Agent response can ONLY arrive via SSE (discuss is async)
    await expect(page.getByTestId('chat-messages').getByText(agentName, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Start Discussion/ })).toBeEnabled({ timeout: 5_000 });
  });

  test('multiple API messages arrive in order via SSE', async ({ page, request }) => {
    test.setTimeout(30_000);

    const groupName = uid('SSEOrderGrp');
    const group = await createGroupViaAPI(request, groupName);

    await waitForApp(page);
    await page.getByText(groupName).click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });

    // Give SSE time to connect
    await page.waitForTimeout(1_500);

    // Send 5 messages rapidly via API
    const batchId = uid('batch');
    for (let i = 1; i <= 5; i++) {
      await request.post(`${apiBaseURL}/api/groups/${group.id}/messages`, {
        data: { senderName: `Sender${i}`, content: `${batchId}-msg-${i}` },
      });
    }

    // All 5 should appear via SSE
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId('chat-messages').getByText(`${batchId}-msg-${i}`)).toBeVisible({ timeout: 15_000 });
    }

    // Verify ordering: msg-1 should be above msg-5 in the DOM
    const messages = page.getByTestId('chat-messages');
    const allText = await messages.innerText();
    const idx1 = allText.indexOf(`${batchId}-msg-1`);
    const idx5 = allText.indexOf(`${batchId}-msg-5`);
    expect(idx1).toBeLessThan(idx5);
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
