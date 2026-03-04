# Test Requirements – AlwaysOn v2 Player Progression API

This document defines all functional and non-functional test requirements derived from the project specification. Each requirement is mapped to the learning level where it becomes relevant.

---

## Functional Requirements (FR)

### FR-01: Retrieve Player Progression

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Endpoint**  | `GET /api/players/{playerId}`                                      |
| **Level**     | 1                                                                  |
| **Input**     | Valid `playerId` (GUID or string identifier)                       |
| **Expected**  | Returns JSON with `playerId`, `level`, `score`, `achievements`     |
| **Edge Cases**| Unknown playerId → 404; Invalid format → 400                      |

### FR-02: Create Player Progression

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Endpoint**  | `POST /api/players/{playerId}`                                     |
| **Level**     | 1                                                                  |
| **Input**     | JSON body with initial progression data                            |
| **Expected**  | Returns 201 with created player data                               |
| **Edge Cases**| Duplicate playerId → 409 Conflict; Missing body → 400             |

### FR-03: Update Player Progression

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Endpoint**  | `PUT /api/players/{playerId}`                                      |
| **Level**     | 1                                                                  |
| **Input**     | JSON body with updated progression data                            |
| **Expected**  | Returns 200 with updated player data                               |
| **Edge Cases**| Non-existent playerId → 404; Concurrent updates → last-write-wins or merge |

### FR-04: Concurrent Update Handling

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 1–2                                                                |
| **Scenario**  | Multiple clients updating the same player simultaneously           |
| **Expected**  | No data corruption; Orleans single-threaded grain guarantees order |
| **Test**      | Send 100 concurrent PUT requests for the same player; verify final state is consistent |

### FR-05: Health Check Endpoints

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 2                                                                  |
| **Endpoints** | `GET /health` (liveness), `GET /health/ready` (readiness)          |
| **Expected**  | Returns 200 when healthy, 503 when degraded                       |

### FR-06: Event-Driven State Propagation

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 2–3                                                                |
| **Scenario**  | Player update triggers event on Service Bus / Event Hubs           |
| **Expected**  | Event is published within 1 second of state change                 |
| **Test**      | Subscribe to event stream; update a player; verify event received  |

### FR-07: Multi-Region Data Consistency

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 3                                                                  |
| **Scenario**  | Write in Region A, read from Region B                              |
| **Expected**  | Data is eventually consistent within configured window             |
| **Test**      | Write player data in one region; poll read from another; measure convergence time |

---

## Non-Functional Requirements (NFR)

### NFR-01: Throughput

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 1: ≥ 1,000 TPS · Level 2: ≥ 5,000 TPS · Level 3+: ≥ 10,000 TPS |
| **Test Tool** | k6, Locust, or Azure Load Testing                                 |
| **Method**    | Ramp-up load test; measure sustained RPS at < 1% error rate        |
| **Pass**      | Sustained target TPS for ≥ 5 minutes with < 1% error rate          |

### NFR-02: Latency (P99)

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 1–2: < 500ms · Level 3+: < 200ms globally                   |
| **Test Tool** | k6 or Azure Load Testing from multiple geographic locations        |
| **Method**    | Measure P50, P95, P99 latency under sustained load                 |
| **Pass**      | P99 < target for ≥ 5 minutes under target TPS                      |

### NFR-03: Availability

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 3+: 99.99% (≈ 52 minutes downtime/year)                     |
| **Test**      | 48-hour soak test measuring uptime                                 |
| **Method**    | Continuous synthetic probes from multiple regions                   |
| **Pass**      | < 0.01% failed probes over 48 hours                                |

### NFR-04: Data Consistency

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Eventual consistency across all regions                            |
| **Test**      | Write-then-read from different regions; measure replication lag     |
| **Pass**      | 99th percentile replication lag < 5 seconds                        |

### NFR-05: Recovery Time Objective (RTO)

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 3+: < 5 minutes                                             |
| **Test**      | Simulate region failure; measure time to full recovery             |
| **Method**    | Kill an AKS cluster; verify traffic reroutes and APIs respond      |
| **Pass**      | Full API recovery in < 5 minutes from failure injection            |

### NFR-06: Recovery Point Objective (RPO)

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 3+: < 1 minute of data loss                                 |
| **Test**      | Write continuous data; kill a region; measure data loss window      |
| **Method**    | Compare last committed write in failed region vs. replicated state  |
| **Pass**      | < 1 minute of writes lost                                          |

### NFR-07: Geographic Distribution

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Target**    | Level 3+: Active deployments in 3+ Azure regions                  |
| **Test**      | Verify AKS clusters, databases, and load balancing across regions  |
| **Pass**      | Traffic served from ≥ 3 regions with independent health probes     |

---

## Security Tests (SEC)

### SEC-01: Authentication & Authorization

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 2+                                                                 |
| **Test**      | Unauthenticated requests rejected; valid tokens accepted           |
| **Pass**      | 401 on missing/invalid token; 200 on valid token                   |

### SEC-02: Input Validation

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 1+                                                                 |
| **Test**      | Malformed JSON, SQL injection, oversized payloads                  |
| **Pass**      | 400 on invalid input; no server errors or data leaks               |

### SEC-03: Secrets Management

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 2+                                                                 |
| **Test**      | No secrets in source code, config, or container images             |
| **Method**    | Static analysis scan (e.g., `gitleaks`, `trivy`)                   |
| **Pass**      | Zero secrets detected                                              |

### SEC-04: Container Image Security

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 2+                                                                 |
| **Test**      | Container image vulnerability scan                                 |
| **Method**    | `trivy image` or Azure Defender for Containers                     |
| **Pass**      | No critical or high CVEs in production images                      |

---

## Chaos Engineering Tests (CHAOS)

### CHAOS-01: Pod Failure

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 3–4                                                                |
| **Method**    | Kill random pods; verify Orleans grain reactivation                |
| **Pass**      | API recovers within 30 seconds; no data loss                       |

### CHAOS-02: Node Failure

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 3–4                                                                |
| **Method**    | Drain/cordon a node; verify workload redistribution                |
| **Pass**      | Traffic redistributes; P99 < 500ms during failover                 |

### CHAOS-03: Region Failure

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 3–4                                                                |
| **Method**    | Disable traffic to one region via Front Door                       |
| **Pass**      | Remaining regions absorb traffic; RTO < 5 minutes                  |

### CHAOS-04: Database Failover

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 3–4                                                                |
| **Method**    | Trigger Cosmos DB region failover                                  |
| **Pass**      | Application continues serving requests; RPO < 1 minute            |

### CHAOS-05: Network Partition

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 4                                                                  |
| **Method**    | Inject latency/packet loss between services                        |
| **Pass**      | Circuit breakers activate; graceful degradation                    |

---

## Performance Soak Test (SOAK)

### SOAK-01: 48-Hour Endurance

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| **Level**     | 4                                                                  |
| **Method**    | Sustained 10,000 TPS load for 48 hours                            |
| **Metrics**   | Latency P50/P95/P99, error rate, memory, CPU, GC pauses           |
| **Pass**      | No memory leaks; error rate < 0.1%; latency stable; no restarts   |

---

## Test Tooling Recommendations

| Category       | Recommended Tools                                           |
|----------------|-------------------------------------------------------------|
| Unit           | xUnit, NSubstitute, FluentAssertions                        |
| Integration    | `Microsoft.Orleans.TestingHost`, `WebApplicationFactory`    |
| Load           | k6, Azure Load Testing, Locust                              |
| Chaos          | Azure Chaos Studio, Chaos Mesh, LitmusChaos                |
| Security       | Trivy, Gitleaks, Microsoft Defender for Containers          |
| Observability  | Application Insights, Prometheus, Grafana                   |
