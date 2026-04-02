# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for the AlwaysOn v2 Player Progression API.

## Category Legend

| Postfix | Meaning |
|---------|---------|
| **DI** | Decided & Implemented |
| **DNI** | Decided & Not Implemented |
| **UI** | Undecided & Implemented |
| **UNI** | Undecided & Not Implemented |

## Index

| ADR | Title | Status | Category |
|-----|-------|--------|----------|
| [ADR-0000](0000-adr-template-DI.md) | ADR Template | Accepted | DI |
| [ADR-0001](0001-compute-platform-DI.md) | Compute Platform | Accepted (Pre-defined) | DI |
| [ADR-0001](0001-deployment-strategy-DI.md) | Deployment Strategy | Accepted | DI |
| [ADR-0002](0002-application-framework-DI.md) | Application Framework | Accepted (Pre-defined) | DI |
| [ADR-0002](0002-multi-stamp-architecture-DI.md) | Multi-Stamp Architecture per Region | Accepted | DI |
| [ADR-0003](0003-programming-language-DI.md) | Programming Language | Accepted (Implied by 0002) | DI |
| [ADR-0004](0004-architecture-pattern-UI.md) | Architecture Pattern | Accepted (Pre-defined) | UI |
| [ADR-0005](0005-database-choice-UI.md) | Database Choice | Proposed | UI |
| [ADR-0006](0006-messaging-platform-UNI.md) | Messaging Platform | Proposed | UNI |
| [ADR-0007](0007-caching-strategy-UNI.md) | Caching Strategy | Proposed | UNI |
| [ADR-0008](0008-api-design-UI.md) | API Design Style | Proposed | UI |
| [ADR-0009](0009-observability-stack-UI.md) | Observability Stack | Proposed | UI |
| [ADR-0010](0010-infrastructure-as-code-UI.md) | Infrastructure as Code | Proposed | UI |
| [ADR-0011](0011-cicd-pipeline-UI.md) | CI/CD Pipeline | Proposed | UI |
| [ADR-0012](0012-multi-region-strategy-UI.md) | Multi-Region Strategy | Proposed | UI |
| [ADR-0013](0013-data-consistency-model-UI.md) | Data Consistency Model | Proposed | UI |
| [ADR-0014](0014-security-approach-UI.md) | Security Approach | Proposed | UI |
| [ADR-0015](0015-testing-strategy-UI.md) | Testing Strategy | Proposed | UI |
| [ADR-0016](0016-container-strategy-UI.md) | Container Strategy | Proposed | UI |
| [ADR-0017](0017-api-versioning-UNI.md) | API Versioning | Proposed | UNI |
| [ADR-0018](0018-concurrency-handling-UI.md) | Concurrency Handling | Proposed | UI |
| [ADR-0019](0019-global-load-balancing-UI.md) | Global Load Balancing | Proposed | UI |
| [ADR-0020](0020-disaster-recovery-UNI.md) | Disaster Recovery | Proposed | UNI |
| [ADR-0021](0021-cost-management-UI.md) | Cost Management | Proposed | UI |
| [ADR-0022](0022-secrets-management-UI.md) | Secrets Management | Proposed | UI |
| [ADR-0023](0023-data-access-patterns-UI.md) | Data Access Patterns | Proposed | UI |
| [ADR-0024](0024-deployment-strategy-UNI.md) | Deployment Strategy | Proposed | UNI |
| [ADR-0025](0025-rate-limiting-UI.md) | Rate Limiting | Proposed | UI |
| [ADR-0026](0026-playeronlevel0-lightweight-api-DI.md) | PlayersOnLevel0 Lightweight API | Accepted | DI |
| [ADR-0027](0027-multi-tenancy-DNI.md) | Multi-Tenancy | Proposed | DNI |
| [ADR-0028](0028-config-management-UI.md) | Config Management | Proposed | UI |
| [ADR-0029](0029-service-identity-wiring-UI.md) | Service Identity Wiring | Proposed | UI |
| [ADR-0030](0030-iac-service-connector-placement-UNI.md) | IaC Service Connector Placement | Proposed | UNI |
| [ADR-0031](0031-cluster-bootstrapping-and-resource-management-UI.md) | Cluster Bootstrapping | Proposed | UI |
| [ADR-0032](0032-coding-principles-DI.md) | Coding Principles | Accepted | DI |
| [ADR-0033](0033-module-design-DI.md) | Module Design | Accepted | DI |
| [ADR-0034](0034-simplified-hexagonal-architecture-DI.md) | Simplified Hexagonal Architecture | Accepted | DI |
| [ADR-0035](0035-file-organization-DI.md) | File Organization | Accepted | DI |
| [ADR-0036](0036-type-safe-lookups-DI.md) | Type-Safe Lookups | Accepted | DI |
| [ADR-0037](0037-idempotent-finite-state-machines-DI.md) | Idempotent Finite State Machines | Accepted | DI |
| [ADR-0038](0038-matrix-testing-DI.md) | Matrix Testing | Accepted | DI |
| [ADR-0039](0039-orleans-ingress-DI.md) | Orleans Ingress | Accepted | DI |
| [ADR-0040](0040-global-application-frontdoor-ingress-DI.md) | Global Application — Front Door as Multi-Silo Ingress | Accepted | DI |
| [ADR-0040](0040-level0-integration-only-testing-DI.md) | Level0 Integration-Only Testing | Accepted | DI |
| [ADR-0041](0041-accessibility-first-e2e-selectors-DI.md) | Accessibility-First Selectors for E2E Testing | Accepted | DI |
| [ADR-0042](0042-command-stream-storage-port-UNI.md) | Command Stream Storage Port for Click Processing | Proposed | UNI |
| [ADR-0043](0043-event-reactors-for-achievements-UNI.md) | Event Reactors for Achievement Evaluation | Proposed | UNI |
| [ADR-0044](0044-native-aot-for-level0-api-DI.md) | Native AOT for PlayersOnLevel0 API | Accepted | DI |
| [ADR-0045](0045-flux-variable-substitution-conventions-DI.md) | Flux Variable Substitution Conventions | Accepted | DI |
| [ADR-0046](0046-ci-driven-image-tag-updates-DI.md) | CI-Driven Image Tag Updates | Accepted | DI |
| [ADR-0047](0047-playersonorleons-minimal-orleans-alternative-DI.md) | PlayersOnOrleans — Minimal Orleans Alternative | Accepted | DI |
| [ADR-0048](0048-per-app-istio-gateways-DI.md) | Per-App Istio Gateways for Traffic Isolation | Accepted | DI |
| [ADR-0049](0049-cicd-infrastructure-deployment-lessons-DarkUX.md) | CI/CD and Infrastructure Deployment Lessons | Accepted | DarkUX |
| [ADR-0050](0050-blue-green-stamp-lifecycle-DI.md) | Blue/Green Stamp Lifecycle | Accepted | DI |
| [ADR-0051](0051-direct-azure-monitor-otel-exporters-DI.md) | Direct Azure Monitor OTEL Exporters for Trace Telemetry | Accepted | DI |

## Format

Each ADR follows the template in [0000-adr-template-DI.md](0000-adr-template-DI.md), based on the [MADR](https://adr.github.io/madr/) format.
