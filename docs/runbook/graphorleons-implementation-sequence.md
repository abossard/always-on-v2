# GraphOrleons Implementation Sequence

## Goal

Rework GraphOrleons so that:

- backend and contracts continue to use the term `component`
- "instrument" is only a UI presentation term
- component state is a merged property set with per-property last-updated metadata
- component persistence uses dirty interval flushing
- the tenant's current model is built from component state changes
- the update pipeline uses a storage-queue-backed Orleans stream provider
- the UI becomes intentionally basic: tenant selector plus current tenant model display
- compontent grains stream publish details to the tenant
- the API exposes SSE for susscribe to tenant model updates
## Non-Goals

- do not keep the current rich GraphView copy, grouping, or dependency-tree storytelling
- do not make the frontend consume Orleans streams directly in the first pass

## Design Constraints

1. Internal naming stays `component`.
2. UI copy may say `instrument` where it helps the hospital use case.
3. `GraphView` should be recreated from scratch to the minimum useful screen:
   - tenant selection dropdown
   - current model for the selected tenant
   - no topology-reading guide
   - no domain group summary
   - no selected-node explainer panel
   - no "entry services/shared dependencies" language
4. Testing must be made easier as part of the implementation, not added afterward.

## Implementation Order

### Phase 1: Lock the Contracts

Outcome:

- `component` remains the backend concept
- graph/model payloads can support hospital display terms without renaming internals

Files:

- `src/GraphOrleons/GraphOrleons.Api/Domain.cs`
- `src/GraphOrleons/GraphOrleons.Api/Storage.cs`
- `src/GraphOrleons/GraphOrleons.Web/src/types.ts`

Changes:

- Replace raw latest-payload-centric component contracts with merged state contracts.
- Add a property value model that includes:
  - property name
  - normalized value
  - last updated timestamp
- Add component-level metadata needed for model building, for example:
  - display name
  - optional category/type
  - optional location
  - optional relationship list
- Keep a compatibility path for existing event ingestion while moving toward explicit relationship data.

Test facilitation:

- Add a single shared test builder for component state payloads so tests stop hand-crafting JSON.
- Add a shared sample graph/model fixture in tests so backend and UI assertions use the same shape.

Tests:

- contract serialization tests for new component snapshot shapes
- compatibility test for old event payloads if fallback support is kept

### Phase 2: Move ComponentGrain to Merged State

Outcome:

- each component grain owns merged component state
- only effective changes mark the grain dirty

Files:

- `src/GraphOrleons/GraphOrleons.Api/ComponentGrain.cs`
- `src/GraphOrleons/GraphOrleons.Api/Config.cs`

Changes:

- Merge incoming payload properties into grain state instead of replacing the latest payload blob.
- Update per-property timestamps only when the value changes.
- Track whether the grain became dirty after merge.
- Separate these responsibilities inside the grain:
  - merge state
  - decide effective change
  - publish model update event
  - persist on timer
- Payload limits is 64kb
- it should have at most 64 propertoes merged and each property can have a value size of max 1kb. 
- payload limit shold be checked on the rest API itself
- if 64 properties are reached in the component grain, it will evict the oldest one

Test facilitation:

- Extract merge logic into a small pure helper or internal service so it can be tested without Orleans activation.
- Add deterministic clock injection for timestamp assertions.

Tests:

- merged-state update test
- unchanged value does not refresh timestamp
- changed value refreshes timestamp
- new property insertion test
- relationship update test

### Phase 3: Add Dirty Interval Persistence

Outcome:

- component state persistence behaves like HelloGrain: buffered, periodic, and flush-on-deactivate

Files:

- `src/GraphOrleons/GraphOrleons.Api/ComponentGrain.cs`
- `src/GraphOrleons/GraphOrleons.Api/Config.cs`
- `src/GraphOrleons/GraphOrleons.Api/Storage.cs`

Changes:

- Add configurable flush interval settings for component state.
- Persist only when dirty.
- Flush on deactivation.
- Replace the current component storage document so it stores:
  - merged properties
  - per-property timestamps
  - component metadata
  - last effective update time
  - optional version/generation

Test facilitation:

- Make flush interval overrideable in tests.
- Expose a storage spy/fake so tests can assert write counts directly.

Tests:

- dirty component writes once per interval
- non-dirty component does not write
- deactivate flush test
- write-count regression test to prevent reintroducing write-per-event behavior

### Phase 4: Introduce Tenant Stream Projection

Outcome:

- component grains publish effective changes to a tenant stream
- model projection is stream-driven

Files:

- `src/GraphOrleons/GraphOrleons.Api/Program.cs`
- `src/GraphOrleons/GraphOrleons.Api/ComponentGrain.cs`
- `src/GraphOrleons/GraphOrleons.Api/TenantGrain.cs`
- `src/GraphOrleons/GraphOrleons.Api/ModelGrain.cs`
- `src/GraphOrleons/GraphOrleons.AppHost/AppHost.cs`

Changes:

- Configure Orleans streams with Azure Queue Storage when available.
- Keep memory stream fallback for local or test environments.
- Provision queues in the AppHost.
- Publish a tenant-scoped component-updated event only on effective change.
- Make `ModelGrain` consume those stream events and rebuild the current model from component state.
- Keep `TenantGrain` focused on tenant-level coordination and active/current model selection.

Test facilitation:

- Use a provider abstraction or test environment switch so stream tests can run with the in-memory provider.
- Add a reusable stream-event builder for component-updated events.

Tests:

- component effective change publishes one tenant event
- unchanged merge publishes no event
- model projection updates from tenant stream
- tenant isolation across streams
- current model endpoint returns the projected model

### Phase 5: Simplify the API for the UI

Outcome:

- the frontend can ask one simple question: "show me the selected tenant's current model"

Files:

- `src/GraphOrleons/GraphOrleons.Api/Endpoints.cs`
- `src/GraphOrleons/GraphOrleons.Api/Routes.cs`
- `src/GraphOrleons/GraphOrleons.Web/src/api.ts`

Changes:

- Keep the tenant list endpoint.
- Keep or rename the active graph/current model endpoint so its purpose is explicit.
- Return a model shape that is display-ready for the minimal UI.
- Avoid extra frontend composition work where the backend can provide a single current-model response.

Test facilitation:

- Add API snapshot fixtures for tenant list and current model responses.
- Add a small fake current-model response for frontend component tests.

Tests:

- tenant list endpoint test
- current model endpoint test
- empty tenant model test

### Phase 6: Replace GraphView With a Basic Screen

Outcome:

- `GraphView` becomes simple and literal
- the page shows tenant selection and the current model only

Files:

- `src/GraphOrleons/GraphOrleons.Web/src/components/GraphView.tsx`
- `src/GraphOrleons/GraphOrleons.Web/src/components/TenantSelector.tsx`
- `src/GraphOrleons/GraphOrleons.Web/src/App.tsx`
- `src/GraphOrleons/GraphOrleons.Web/src/types.ts`

Changes:

- Remove the current topology-studio presentation model.
- Remove all service-oriented copy:
  - dependency tree
  - entry services
  - shared dependencies
  - upstream services
  - downstream services
- Replace it with a minimal screen that shows:
  - tenant selector
  - current tenant label
  - current model visualization or list
- If nodes are still shown visually, keep the node UI basic and data-first.
- Use `component` in code and types, but use `instrument` only in visible labels where needed.

Test facilitation:

- Add stable `data-testid` markers for:
  - tenant selector
  - current model container
  - empty state
  - current model node/list items
- Keep rendering deterministic by removing nonessential auto-focus and summary heuristics from the view.

Tests:

- component test: no selected tenant state
- component test: selected tenant renders current model
- component test: empty model renders empty state
- component test: visible labels use hospital wording without leaking backend renames

### Phase 7: Simplify or Replace Component Detail UI

Outcome:

- component detail display matches merged-state design

Files:

- `src/GraphOrleons/GraphOrleons.Web/src/components/ComponentList.tsx`

Changes:

- Stop centering the UX on payload history.
- Show merged component properties with last-updated timestamps.
- Keep any raw-event history secondary, optional, or hidden from the default screen.

Test facilitation:

- Introduce a table/list renderer that accepts simple props so UI tests do not need to parse raw JSON blobs.

Tests:

- merged property list render test
- property timestamp render test
- optional no-properties state

### Phase 8: Lock the E2E Flow

Outcome:

- the happy path is easy to verify locally and in CI

Files:

- `src/GraphOrleons/GraphOrleons.E2E/tests/events.spec.ts`
- `src/GraphOrleons/GraphOrleons.Tests/PersistenceTests.cs`
- `src/GraphOrleons/GraphOrleons.Tests/EventApiTests.cs`

Changes:

- Rewrite tests around the simplified flow:
  - choose tenant
  - fetch current model
  - show current model
- Add backend tests around merge, flush, and projection.
- Remove E2E expectations tied to the current rich GraphView copy.

Test facilitation:

- Add one backend seeding helper that creates a tenant with a small current model.
- Add one E2E helper that waits on current model readiness instead of timing-based polling.
- Prefer asserting the returned model shape and stable test ids over pixel/layout assertions.

Tests:

- E2E: select tenant and see current model
- E2E: empty tenant shows empty state
- integration: component change updates current model
- persistence: periodic flush and stream projection

## Testing Strategy

### Backend

- pure merge-logic tests
- grain tests for dirty tracking and flush behavior
- integration tests for stream-driven model projection
- API tests for tenant and current model endpoints

### Frontend

- component tests for the simplified `GraphView`
- component tests for merged component detail rendering
- API mocking for current model responses

### End-to-End

- tenant selection flow
- current model display
- empty-state behavior
- one effective-change scenario that updates the current model

## Test Facilitation Checklist

Implement these before or alongside the feature slices:

1. Add test builders for component events, merged component snapshots, and current model responses.
2. Add clock control for timestamp-sensitive tests.
3. Add a write-count spy around component persistence.
4. Add in-memory stream-provider coverage for fast integration tests.
5. Add stable frontend `data-testid` hooks on the simplified screen.
6. Add a tenant/current-model seed helper for E2E and local debugging.

## Recommended Delivery Slices

1. Contracts and merge logic.
2. Dirty flush persistence.
3. Tenant stream publication.
4. Model projection.
5. API simplification.
6. GraphView simplification.
7. Component detail refresh.
8. E2E and regression coverage.

## Definition of Done

- backend naming remains `component`
- UI may use `instrument` only as display text
- component state is merged and timestamped per property
- component persistence is interval-based and dirty-only
- effective component changes publish to the tenant stream
- current tenant model is projected from component updates
- `GraphView` is reduced to tenant selection plus current model display
- tests cover merge, flush, projection, current model API, and the simplified UI flow
