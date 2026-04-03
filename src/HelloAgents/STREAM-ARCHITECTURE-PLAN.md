# HelloAgents: Stream-Driven Architecture Plan

## Overview

Refactor HelloAgents from a **request/response grain-call model** to a **fully event-driven, stream-based architecture** where:

- The **group stream** is the single source of truth for all group activity
- Agents are **autonomous actors** that react to stream events, not RPC targets
- LLM calls are **durably delegated** to ephemeral intent grains
- No grain directly invokes another grain for message/discussion work — all coordination flows through Orleans Streams

---

## Grain Inventory

### Long-Lived Grains

| Grain | Key | State Owner | Purpose |
|---|---|---|---|
| `ChatGroupGrain` | `groupId` (8-char) | Messages, member roster, metadata | Chat room — subscribes to its own group stream, persists all events |
| `AgentGrain` | `agentId` (8-char) | Persona, reflection journal, group memberships, per-group context windows | Autonomous agent — subscribes to group streams + own agent stream, decides when to respond |
| `GroupRegistryGrain` | `"default"` (singleton) | `Dictionary<id, name>` | Index of all groups |
| `AgentRegistryGrain` | `"default"` (singleton) | `Dictionary<id, name>` | Index of all agents |

### Ephemeral Grains

| Grain | Key | State Owner | Purpose |
|---|---|---|---|
| `LlmIntentGrain` | `"{agentId}-{guid8}"` | Request payload, completion flag | Single-use LLM I/O worker — persists intent, calls LLM, publishes result to agent stream, self-destructs |

---

## Stream Topology

| Stream ID | Namespace | Publishers | Subscribers |
|---|---|---|---|
| `group:{groupId}` | `"ChatMessages"` | API endpoint (user messages), `AgentGrain` (agent responses, join/leave events) | `ChatGroupGrain` (persist & track members), all member `AgentGrain`s (context & decision), Frontend (SSE) |
| `agent:{agentId}` | `"ChatMessages"` | `LlmIntentGrain` (LLM results) | The owning `AgentGrain` (post-processing & forwarding) |

### Stream Message Schema

All events on the group stream use a single `ChatMessageState` type, discriminated by `EventType` and `SenderType`:

```
EventType: Message | AgentJoined | AgentLeft
SenderType: User | Agent | System     — enum, NOT emoji-based detection
SenderName: string        — agent name or user name
SenderEmoji: string       — avatar emoji (display only)
Content: string           — message text (empty for join/leave)
GroupId: string            — which group this belongs to
Timestamp: DateTimeOffset
```

`ShouldRespond` uses `SenderType` to decide, never emoji strings.

The agent stream carries a separate `IntentResult` type:

```
GroupId: string            — which group triggered this
Response: string           — raw LLM output
IntentId: string           — for correlation/dedup
IntentType: Response | Reflection   — what kind of LLM call this was
```

---

## State Ownership

### AgentGrainState

```
Name: string
SystemPrompt: string
AvatarEmoji: string
GroupIds: HashSet<string>
ReflectionJournal: string
Initialized: bool
GroupContexts: Dictionary<string, List<ChatMessageState>>  // NEW — live context per group
```

- `GroupContexts` is populated from group stream events in real-time
- Capped at the last 50 messages per group (in-memory, not persisted — rebuilt from stream on activation, or optionally persisted for faster recovery)
- `ReflectionJournal` updated by the agent after each LLM response

### ChatGroupGrainState

```
Name: string
Description: string
Agents: Dictionary<string, AgentInfo>   // CHANGED from HashSet<string> AgentIds
Messages: List<ChatMessageState>
CreatedAt: DateTimeOffset
Initialized: bool
```

- `Agents` is a map of `agentId → AgentInfo(id, name, emoji)` — populated from `AgentJoined`/`AgentLeft` events on the group stream
- `Messages` includes all message types (user, agent, system join/leave)
- Group never calls agent grains. It learns about members purely from stream events.

#### Cosmos DB 2MB Document Limit

Orleans persists the entire grain state as a single Cosmos DB document. The 2MB limit means `Messages` cannot grow unbounded. Mitigation:

- Cap `Messages` at e.g. 200 most recent entries (current behavior, keep it)
- Each `ChatMessageState` is roughly 500 bytes → 200 messages ≈ 100KB → safely within limits
- If long-term history is needed in the future: archive older messages to a separate Cosmos container via a grain timer or external process, not in the hot grain state

### LlmIntentGrainState

```
AgentId: string              // to fetch system prompt on retry
GroupId: string
Context: List<ChatMessage>   // serialized prompt context
IntentType: Response | Reflection
Completed: bool
CreatedAt: DateTimeOffset
```

- **Minimal storage**: does NOT duplicate SystemPrompt, ReflectionJournal, or AvatarEmoji. On retry (crash recovery), fetches these from the AgentGrain — retry is the rare path, so the extra grain call is acceptable.
- Persisted before LLM call — this IS the durability guarantee
- On activation: if `Completed == false` and state exists → fetch agent persona from AgentGrain, then retry the LLM call
- After completion: **clear state** (`ClearStateAsync`) then `DeactivateOnIdle()` — the Cosmos document is deleted, not left as garbage

---

## Detailed Flows

### Flow 1: Agent Joins a Group

```
1. API endpoint receives POST /api/groups/{groupId}/agents { agentId }
2. Endpoint calls AgentGrain.JoinGroupAsync(groupId)
3. AgentGrain:
   a. Adds groupId to State.GroupIds
   b. Initializes empty GroupContexts[groupId]
   c. Persists state (WriteStateAsync)
   d. Subscribes to stream("group:{groupId}") — stores handle in Dictionary<groupId, handle>
   e. Publishes AgentJoined event to stream("group:{groupId}") with own name + emoji
4. Stream delivers AgentJoined to all subscribers:
   - ChatGroupGrain: adds AgentInfo to State.Agents, persists, appends system message to Messages
   - Other AgentGrains in the group: see the join event in OnGroupMessage (can react if desired)
   - Frontend SSE: receives system message "👩‍🔬 Alice joined the group"
```

### Flow 2: User Sends a Message

```
1. API endpoint receives POST /api/groups/{groupId}/messages { content }
2. Endpoint publishes directly to stream("group:{groupId}") as a Message event
   (SenderName: user name, SenderEmoji: "👤", EventType: Message)
3. Stream delivers to all subscribers:
   - ChatGroupGrain.OnStreamEvent: appends to State.Messages, persists
   - Each AgentGrain.OnGroupMessage:
     a. Skips if sender is self
     b. Appends to GroupContexts[groupId] (live context window)
     c. Calls ShouldRespond(msg) — returns true for human messages
     d. If yes: spawns LlmIntentGrain (see Flow 3)
   - Frontend SSE: renders user message
```

### Flow 3: Agent Responds (LLM Intent Lifecycle)

```
1. AgentGrain decides to respond in OnGroupMessage:
   a. Generates intentId = "{agentId}-{guid8}"
   b. Builds IntentRequest with MINIMAL data:
      - AgentId, GroupId
      - Context = GroupContexts[groupId].TakeLast(20) formatted as chat messages
      - IntentType = Response
      (does NOT include SystemPrompt, ReflectionJournal, AvatarEmoji — avoids duplication)
   c. Passes agent persona inline for the initial call (not persisted in intent state):
      - SystemPrompt, ReflectionJournal, AgentName, AvatarEmoji
   d. Gets LlmIntentGrain reference by intentId
   e. Calls intent.InvokeOneWay(g => g.ExecuteAsync(request, persona)) — fire and forget

2. LlmIntentGrain.ExecuteAsync(request, persona):
   a. Persists minimal IntentState (AgentId, GroupId, Context, IntentType) — DURABILITY CHECKPOINT
      persona is NOT persisted — on retry it will be fetched from the AgentGrain
   b. Builds LLM prompt:
      - System message: persona.SystemPrompt + persona.ReflectionJournal
      - Conversation context: recent messages from the group
      - Final instruction: "Respond as {AgentName}, 2-4 sentences, in character"
   c. Calls chatClient.GetResponseAsync() — THE unreliable boundary
   d. On success: publishes IntentResult(GroupId, Response, IntentId, IntentType=Response)
      to stream("agent:{agentId}")
   e. Clears state (ClearStateAsync) — Cosmos document deleted
   f. Calls DeactivateOnIdle() — grain vanishes cleanly

3. LlmIntentGrain.OnActivateAsync (crash recovery only):
   a. If State has AgentId and Completed == false:
      - Fetches persona from AgentGrain.GetInfoAsync()
      - Calls ExecuteAsync(persisted request, fetched persona)

4. AgentGrain receives IntentResult on its agent stream (OnIntentCompleted):
   a. Checks IntentType == Response
   b. Publishes agent response to stream("group:{groupId}") as a Message event
      (SenderName: agent name, SenderEmoji: agent emoji, SenderType: Agent, EventType: Message)
   c. Spawns a SEPARATE reflection intent grain (see Reflection Journal Update section)

5. Stream delivers agent response to all group subscribers:
   - ChatGroupGrain: appends to Messages, persists
   - Other AgentGrains: see the response, update their GroupContexts
     → ShouldRespond returns false for SenderType.Agent messages (prevents infinite loops)
   - Frontend SSE: renders agent response
```

### Flow 4: Crash Recovery

```
Scenario: Silo crashes after LlmIntentGrain persists intent but before LLM response

1. Orleans reactivates LlmIntentGrain on another silo (or same silo after restart)
2. OnActivateAsync checks: State exists AND Completed == false
3. Calls ExecuteAsync again with the persisted request
4. LLM call succeeds → publishes to agent stream → normal flow resumes
5. AgentGrain may have also reactivated — it resubscribes to its streams in OnActivateAsync

Scenario: Silo crashes after LlmIntentGrain publishes but before AgentGrain processes

1. Orleans Streams with Azure Queue Storage provide at-least-once delivery
2. The IntentResult will be redelivered to the AgentGrain's agent stream
3. Deduplication by intentId prevents duplicate responses
   (AgentGrain checks if it already published a response for this intentId)
```

### Flow 5: Agent Leaves a Group

```
1. API endpoint receives DELETE /api/groups/{groupId}/agents/{agentId}
2. Endpoint calls AgentGrain.LeaveGroupAsync(groupId)
3. AgentGrain:
   a. Publishes AgentLeft event to stream("group:{groupId}")
   b. Unsubscribes using stored handle for this groupId
   c. Removes groupId from State.GroupIds and GroupContexts
   d. Persists state
4. Stream delivers AgentLeft:
   - ChatGroupGrain: removes agent from State.Agents, persists, appends system message
   - Other AgentGrains: see departure
   - Frontend SSE: renders "👩‍🔬 Alice left the group"
```

### Flow 6: SSE Endpoint

```
1. Frontend connects to GET /api/groups/{groupId}/stream
2. Endpoint subscribes to stream("group:{groupId}")
3. Every event (Message, AgentJoined, AgentLeft) is serialized as JSON and sent as SSE
4. On client disconnect: unsubscribe from stream
```

---

## Stream Subscription Lifecycle

Orleans persists stream subscriptions in PubSubStore (backed by Cosmos or memory). However, subscription **handles** (the in-memory callback wiring) are lost on grain deactivation. This must be handled explicitly.

### On `OnActivateAsync` — all grains that subscribe to streams:

**ChatGroupGrain:**
```
1. Get stream reference for stream("group:{myGroupId}")
2. Get all existing subscription handles via stream.GetAllSubscriptionHandles()
3. If handles exist → call handle.ResumeAsync(OnStreamEvent) for each
4. If no handles exist (first activation) → call stream.SubscribeAsync(OnStreamEvent)
```

**AgentGrain:**
```
1. For the agent stream stream("agent:{myAgentId}"):
   - Get existing handles → ResumeAsync(OnIntentCompleted)
   - If none → SubscribeAsync(OnIntentCompleted)
   - This subscription IS persistent (PubSubStore) — so if an intent grain
     publishes while the agent is deactivated, Orleans reactivates the agent
2. For each groupId in State.GroupIds:
   - Get stream reference for stream("group:{groupId}")
   - Get existing handles → ResumeAsync(OnGroupMessage)
   - Store handle in Dictionary<groupId, handle> for later unsubscribe
   (If no persisted handles exist for a group, subscribe fresh)
```

This ensures that after any deactivation/reactivation cycle, all stream callbacks are rewired correctly. PubSubStore guarantees the subscriptions survive silo restarts.

**Note on LlmIntentGrain:** The intent grain does NOT subscribe to any stream. It only publishes to `stream("agent:{agentId}")`. There is no persistent subscription on the intent grain side — it is a pure publisher.

---

## ChatGroupGrain Bootstrap & Reactivation

The ChatGroupGrain subscribes to its own group stream. This creates a bootstrap question: what activates the grain in the first place?

```
1. POST /api/groups → endpoint calls GroupGrain.InitializeAsync()
   → OnActivateAsync runs → subscribes to stream("group:{id}")
   → subscription persisted in PubSubStore

2. Grain deactivates after idle timeout

3. Agent publishes AgentJoined to stream("group:{id}")
   → Orleans PubSubStore knows ChatGroupGrain is subscribed
   → Orleans reactivates the grain to deliver the event
   → OnActivateAsync runs → ResumeAsync rewires the callback
   → OnStreamEvent receives the AgentJoined event
```

The grain does NOT need to be pre-activated. PubSubStore handles reactivation on event delivery. If the group was never initialized but someone publishes to its stream, the grain activates with `Initialized == false` and the `OnStreamEvent` handler should check this and ignore events for uninitialized groups.

---

## API Endpoint Validation

No validation needed. If a client publishes to a stream for a non-existent group, the event is simply dropped — no subscriber means no delivery, no state created, no side effects. This is the caller's problem, not the system's.

The ChatGroupGrain's `OnStreamEvent` handler does check `Initialized` as a safety net, ignoring events for uninitialized groups.

---

## ShouldRespond Decision Logic

The `ShouldRespond` method on `AgentGrain` controls when an agent autonomously replies. Uses `SenderType` enum and `EventType` — never emoji strings. Initial implementation:

| Event | SenderType | EventType | Response |
|---|---|---|---|
| User message | `User` | `Message` | Always respond |
| Agent message | `Agent` | `Message` | Do not respond (prevents infinite loops) |
| Join / Leave | any | `AgentJoined` / `AgentLeft` | Do not respond |
| System message | `System` | `Message` | Respond if content contains "discuss" |

Future possibilities (not in initial scope):
- LLM-based decision ("given this message, should I chime in?")
- Cooldown timer per group (respond at most once per N seconds)
- Turn-taking protocol for structured debates
- Configurable per-agent response policy

---

## Concurrency Model

| Grain | Reentrancy | Rationale |
|---|---|---|
| `ChatGroupGrain` | No (default) | Stream events processed sequentially — safe state mutation |
| `AgentGrain` | No (default) | Single-threaded — stream callbacks and spawn intent are fast (no awaiting LLM) |
| `LlmIntentGrain` | No (default) | One intent = one LLM call — no concurrency within a single intent |
| Registry grains | No (default) | Simple dictionary mutations |

The key insight: `AgentGrain` never blocks on LLM calls. It spawns an `LlmIntentGrain` via `InvokeOneWay` and returns immediately. This means:
- An agent in 10 groups can process 10 incoming messages rapidly
- Each spawns a separate intent grain
- The 10 LLM calls execute in parallel across the cluster
- Results trickle back via the agent stream

---

## Idempotency (No Deduplication)

At-least-once delivery means the same IntentResult could arrive twice on the agent stream. However, we do NOT maintain dedup state. Reasons:

- A dedup set in memory explodes under failure scenarios (thousands of agents, mass intent failures)
- A persisted dedup set adds Cosmos writes on every message — negates the benefit

Instead, all operations triggered by stream events are **naturally idempotent or tolerate duplicates**:

| Operation | Duplicate behavior | Impact |
|---|---|---|
| Agent publishes response to group stream | Duplicate message appears in group | Acceptable — rare (only on crash), and the group capping at 200 messages means duplicates age out |
| Reflection journal update | Journal summarized twice with same input | Harmless — LLM produces similar summary |
| AgentJoined event | Agent added to Agents dict twice with same key | Idempotent — dict overwrite |
| AgentLeft event | Agent removed twice | Idempotent — second remove is no-op |
| User message appended to group | Duplicate message in history | Only happens on stream provider crash — extremely rare |

If exact-once becomes a requirement in the future, push dedup to the group grain (which already persists message IDs) rather than the agent.

---

## Reflection Journal Update

After an agent publishes a response, it updates its reflection journal **via a separate LlmIntentGrain**, not inline.

### Why not inline?

The AgentGrain is non-reentrant. An inline `await chatClient.GetResponseAsync()` blocks the grain for 1-3 seconds. During that time, all incoming stream events (group messages, other intent results) queue up. This defeats the core design: the agent must remain responsive to stream events at all times.

### Flow

1. In `OnIntentCompleted`, after publishing the response to the group stream, the agent spawns a reflection intent:
   - `intentId = "{agentId}-reflect-{guid8}"`
   - `IntentType = Reflection`
   - Context = current ReflectionJournal + latest response text
2. LlmIntentGrain executes the summarization LLM call
3. Publishes IntentResult with `IntentType = Reflection` to `stream("agent:{agentId}")`
4. AgentGrain receives it in `OnIntentCompleted`:
   - Checks `IntentType == Reflection`
   - Updates `State.ReflectionJournal` with the result
   - Persists state
   - Does NOT publish to any group stream (reflection is internal)

### Failure behavior

If the reflection intent grain crashes → it retries (same durability as response intents). If it ultimately fails → journal doesn't update. This is acceptable — reflection is best-effort enrichment, not a correctness requirement.

---

## What Changes from Current Code

### Removed
- `IChatGroupGrain.DiscussAsync(rounds)` — agents respond autonomously, no orchestrated turn-taking
- `IChatGroupGrain.AddAgentAsync / RemoveAgentAsync` — group learns membership from stream events
- `IChatGroupGrain.SendMessageAsync` — API endpoint publishes directly to stream
- `IAgentGrain.RespondAsync(groupId, messages)` — agents decide when to respond, not called by groups
- Direct grain-to-grain calls for message flow

### Added
- `LlmIntentGrain` — new grain type for durable LLM I/O
- `IAgentGrain.JoinGroupAsync` now publishes to group stream instead of calling group grain
- `AgentGrain.OnGroupMessage` — stream event handler with ShouldRespond logic
- `AgentGrain.OnIntentCompleted` — processes LLM results from agent stream
- `ChatGroupGrain.OnStreamEvent` — reactive state management from own group stream
- `ChatMessageState.EventType` — discriminator for message vs. join/leave events
- `AgentGrainState.GroupContexts` — live per-group conversation window

### Preserved
- Registry grains — unchanged
- OrchestratorService — updated to use new API surface (post to stream instead of calling DiscussAsync)
- Stream provider configuration (Azure Queue Storage / memory)
- Cosmos DB grain storage configuration
- All API endpoints (same URLs, slightly different internal routing)
- SSE endpoint (subscribes to same group stream, now also sees join/leave events)

---

## API Surface Changes

| Endpoint | Before | After |
|---|---|---|
| `POST /api/groups/{id}/messages` | Calls `GroupGrain.SendMessageAsync` | Publishes directly to `stream("group:{id}")` |
| `POST /api/groups/{id}/discuss` | Calls `GroupGrain.DiscussAsync` which calls each agent sequentially | Publishes a system message to the stream; agents react autonomously |
| `POST /api/groups/{id}/agents` | Calls `GroupGrain.AddAgentAsync` + `AgentGrain.JoinGroupAsync` | Calls `AgentGrain.JoinGroupAsync` only (group learns from stream) |
| `DELETE /api/groups/{id}/agents/{agentId}` | Calls both grains | Calls `AgentGrain.LeaveGroupAsync` only (group learns from stream) |
| `GET /api/groups/{id}` | Calls `GroupGrain.GetStateAsync` | Same — group state now includes `Agents` map |
| `GET /api/groups/{id}/stream` | Subscribes to `ChatMessages` stream | Same stream, now also receives join/leave events |

---

## Stream Provider Configuration

No changes to the stream provider setup. Current configuration supports both:
- **Azure Queue Storage** (production, cross-silo, at-least-once delivery)
- **Memory streams** (dev/test, single silo)

The stream namespace remains `"ChatMessages"`. Stream IDs change from `StreamId.Create("ChatMessages", groupId)` to:
- `StreamId.Create("group", groupId)` for group streams
- `StreamId.Create("agent", agentId)` for agent streams

Both use the same `"ChatMessages"` stream provider.

---

## Open Questions

1. **GroupContext persistence**: `GroupContexts` is NOT persisted — it is rebuilt from stream events after reactivation. This means after a grain deactivation, the agent's first response may have incomplete context. This is a known and accepted tradeoff. The agent's `ReflectionJournal` (which IS persisted) provides continuity of memory even when per-group context is lost.

2. **Multi-round discussion**: With autonomous agents, "rounds" don't map cleanly. Options: (a) system message "Please discuss for 3 rounds" and let agents self-organize, (b) introduce a lightweight timer grain that triggers "your turn" events, (c) drop the concept entirely in favor of organic conversation.

3. **Backpressure**: If 50 agents are in a group and a user sends a message, 50 intent grains spawn simultaneously. This is fine for LLM rate limits? May need agent-level throttling or a queue.
