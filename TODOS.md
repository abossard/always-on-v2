- Learn more about Prometheus monitoring, e.g. how to see of the stuff I'm interested in is being recorded.

## Testing needed for latest commit (796ae98)

### Infrastructure (Bicep)

- [ ] Deploy with `cosmosMode: 'Serverless'` — verify Cosmos DB account is created without provisioned throughput, single-region, periodic backup
- [ ] Deploy with `cosmosMode: 'Provisioned'` — verify autoscale throughput, multi-region write, continuous backup still work
- [ ] Verify Cosmos containers are created successfully in both modes (the `dependsOn` on the conditional databases)
- [ ] Deploy with `eventHubsSku: 'Standard'` — verify namespace deploys without geo-replication, storage uses Standard_LRS, message retention is 1 day
- [ ] Deploy with `eventHubsSku: 'Premium'` — verify geo-replication, RAGZRS storage, 7-day retention still work
- [ ] Deploy with `enableLoadTesting: false` — verify Load Testing resource and its managed identity are skipped
- [ ] Deploy with `enableLoadTesting: true` — verify Load Testing resource still deploys correctly
- [ ] Verify `logRetentionDays` parameter flows through to Log Analytics workspace retention
- [ ] Deploy using the new `budget` environment config in `main.bicepparam` (set `var env = budget`) — full end-to-end
- [ ] Run `az bicep build` on all changed Bicep files to verify no compile errors

### az-healthmodel - New CLI Commands

- [ ] `az healthmodel entity signal list` — returns signals grouped by signal group with `_signalGroup` annotation
- [ ] `az healthmodel entity signal add` — adds a signal instance to an entity's signal group, verify entity PUT round-trip
- [ ] `az healthmodel entity signal remove` — removes a signal by name, verify error when signal not found
- [ ] `az healthmodel entity signal history` — returns signal value history for a time range
- [ ] `az healthmodel entity signal ingest` — submits external health report with health state, value, expiry, and optional context
- [ ] `az healthmodel signal-definition execute` — resolves signal chain (entity→instance→group→definition), executes query, evaluates health thresholds
- [ ] Verify old `healthmodel signal` commands are now under `healthmodel signal-definition` (rename didn't break anything)
- [ ] `az healthmodel mcp` — starts MCP stdio server, responds to tool list/call requests

### az-healthmodel - Signal Query Executor (`query_executor.py`)

- [ ] PromQL query execution against Azure Monitor Workspace — correct URL construction, auth, response parsing
- [ ] Azure resource metrics query execution — correct ARM metrics API call, aggregation type mapping
- [ ] Log Analytics query execution — correct API call, value extraction from tabular response
- [ ] Health threshold evaluation — degraded/unhealthy threshold comparison with correct operator handling (`GreaterThan`, `LessThan`)
- [ ] Signal definition resolution — instance overrides definition fields (signalKind, queryText, timeGrain, etc.)
- [ ] Error handling — query failures return error in result dict, resolution failures raise ValueError

### az-healthmodel - MCP Server (`mcp/server.py`)

- [ ] Bulk operations — passing `items` list executes multiple operations, returns `{results: [{ok, data/error}]}`
- [ ] Single operations — all healthmodel CRUD tools work (model, entity, signal-definition, relationship, auth)
- [ ] Entity signal tools — list, add, remove, history, ingest exposed as MCP tools
- [ ] Signal execute tool — available and functional via MCP
- [ ] Watch tool — returns export SVG content via MCP
- [ ] Error isolation — one failing item in a bulk call doesn't break other items

### az-healthmodel - Search Feature (TUI)

- [ ] Search modal opens with `/` key, closes with `Escape`
- [ ] Typing filters entities and signals with case-insensitive matching
- [ ] Prefix matches sort before substring matches; entities before signals
- [ ] Arrow keys navigate results while input keeps focus
- [ ] Enter selects highlighted result and navigates to it in the tree
- [ ] Re-opening search preserves the previous query text
- [ ] Empty query shows no results
- [ ] Special characters in query don't crash the search
- [ ] Status bar shows search keybinding hint

### az-healthmodel - Domain Model Changes

- [ ] New `SearchResult` dataclass works correctly with all fields (entity_id, display_name, is_signal, health_state, signal_value, parent_display_name)
- [ ] New `models/enums.py` enums are used correctly by the rest of the code
- [ ] `parse.py` changes handle the new domain model structure without regressions

### az-healthmodel - Auth Settings

- [ ] Verify `auth_create` now sends `authenticationKind: ManagedIdentity` + `managedIdentityName` instead of old `identityName` field

### az-healthmodel - Identity Handling

- [ ] Verify `healthmodel_create` with `--identity-type` preserves existing identity fields (uses `setdefault` instead of overwriting)

### az-healthmodel - Tests

- [ ] Run existing E2E tests: `cd src/az-healthmodel && python3 -m pytest azext_healthmodel/tests/test_e2e.py -v`
- [ ] Run search E2E tests: `cd src/az-healthmodel && python3 -m pytest azext_healthmodel/tests/test_search_e2e.py -v`
- [ ] Verify the deleted unit tests (test_errors, test_formatters, test_graph_builder, test_models, test_parse, test_snapshot) are adequately covered by the new E2E tests
