# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for the AlwaysOn v2 Player Progression API.

## Category Legend

| Prefix | Meaning |
|--------|---------|
| **DI** | Decided & Implemented |
| **DNI** | Decided & Not Implemented |
| **UI** | Undecided & Implemented |
| **UNI** | Undecided & Not Implemented |

## Index

| ADR | Title | Status | Category |
|-----|-------|--------|----------|
| [ADR-0000](DI-0000-adr-template.md) | ADR Template | Accepted | DI |
| [ADR-0001](DI-0001-compute-platform.md) | Compute Platform | Accepted (Pre-defined) | DI |
| [ADR-0001](DI-0001-deployment-strategy.md) | Deployment Strategy | Accepted | DI |
| [ADR-0002](DI-0002-application-framework.md) | Application Framework | Accepted (Pre-defined) | DI |
| [ADR-0002](DI-0002-multi-stamp-architecture.md) | Multi-Stamp Architecture per Region | Accepted | DI |
| [ADR-0003](DI-0003-programming-language.md) | Programming Language | Accepted (Implied by 0002) | DI |
| [ADR-0004](UI-0004-architecture-pattern.md) | Architecture Pattern | Accepted (Pre-defined) | UI |
| [ADR-0005](UI-0005-database-choice.md) | Database Choice | Proposed | UI |
| [ADR-0006](UNI-0006-messaging-platform.md) | Messaging Platform | Proposed | UNI |
| [ADR-0007](UNI-0007-caching-strategy.md) | Caching Strategy | Proposed | UNI |
| [ADR-0008](UI-0008-api-design.md) | API Design Style | Proposed | UI |
| [ADR-0009](UI-0009-observability-stack.md) | Observability Stack | Proposed | UI |
| [ADR-0010](UI-0010-infrastructure-as-code.md) | Infrastructure as Code | Proposed | UI |
| [ADR-0011](UI-0011-cicd-pipeline.md) | CI/CD Pipeline | Proposed | UI |
| [ADR-0012](UI-0012-multi-region-strategy.md) | Multi-Region Strategy | Proposed | UI |
| [ADR-0013](UI-0013-data-consistency-model.md) | Data Consistency Model | Proposed | UI |
| [ADR-0014](UI-0014-security-approach.md) | Security Approach | Proposed | UI |
| [ADR-0015](UI-0015-testing-strategy.md) | Testing Strategy | Proposed | UI |
| [ADR-0016](UI-0016-container-strategy.md) | Container Strategy | Proposed | UI |
| [ADR-0017](UNI-0017-api-versioning.md) | API Versioning | Proposed | UNI |
| [ADR-0018](UI-0018-concurrency-handling.md) | Concurrency Handling | Proposed | UI |
| [ADR-0019](UI-0019-global-load-balancing.md) | Global Load Balancing | Proposed | UI |
| [ADR-0020](UNI-0020-disaster-recovery.md) | Disaster Recovery | Proposed | UNI |
| [ADR-0021](UI-0021-cost-management.md) | Cost Management | Proposed | UI |
| [ADR-0022](UI-0022-secrets-management.md) | Secrets Management | Proposed | UI |
| [ADR-0023](UI-0023-data-access-patterns.md) | Data Access Patterns | Proposed | UI |
| [ADR-0024](UNI-0024-deployment-strategy.md) | Deployment Strategy | Proposed | UNI |
| [ADR-0025](UI-0025-rate-limiting.md) | Rate Limiting | Proposed | UI |
| [ADR-0026](DI-0026-playeronlevel0-lightweight-api.md) | PlayersOnLevel0 Lightweight API | Accepted | DI |
| [ADR-0027](DNI-0027-multi-tenancy.md) | Multi-Tenancy | Proposed | DNI |
| [ADR-0028](UI-0028-config-management.md) | Config Management | Proposed | UI |
| [ADR-0029](UI-0029-service-identity-wiring.md) | Service Identity Wiring | Proposed | UI |
| [ADR-0030](UNI-0030-iac-service-connector-placement.md) | IaC Service Connector Placement | Proposed | UNI |
| [ADR-0031](UI-0031-cluster-bootstrapping-and-resource-management.md) | Cluster Bootstrapping | Proposed | UI |
| [ADR-0032](DI-0032-coding-principles.md) | Coding Principles | Accepted | DI |
| [ADR-0033](DI-0033-module-design.md) | Module Design | Accepted | DI |
| [ADR-0034](DI-0034-simplified-hexagonal-architecture.md) | Simplified Hexagonal Architecture | Accepted | DI |
| [ADR-0035](DI-0035-file-organization.md) | File Organization | Accepted | DI |
| [ADR-0036](DI-0036-type-safe-lookups.md) | Type-Safe Lookups | Accepted | DI |
| [ADR-0037](DI-0037-idempotent-finite-state-machines.md) | Idempotent Finite State Machines | Accepted | DI |
| [ADR-0038](DI-0038-matrix-testing.md) | Matrix Testing | Accepted | DI |
| [ADR-0039](DI-0039-orleans-ingress.md) | Orleans Ingress | Accepted | DI |
| [ADR-0040](DI-0040-global-application-frontdoor-ingress.md) | Global Application — Front Door as Multi-Silo Ingress | Accepted | DI |
| [ADR-0040](DI-0040-level0-integration-only-testing.md) | Level0 Integration-Only Testing | Accepted | DI |
| [ADR-0041](DI-0041-accessibility-first-e2e-selectors.md) | Accessibility-First Selectors for E2E Testing | Accepted | DI |
| [ADR-0042](UNI-0042-command-stream-storage-port.md) | Command Stream Storage Port for Click Processing | Proposed | UNI |
| [ADR-0043](UNI-0043-event-reactors-for-achievements.md) | Event Reactors for Achievement Evaluation | Proposed | UNI |
| [ADR-0044](DI-0044-native-aot-for-level0-api.md) | Native AOT for PlayersOnLevel0 API | Accepted | DI |
| [ADR-0045](DI-0045-flux-variable-substitution-conventions.md) | Flux Variable Substitution Conventions | Accepted | DI |
| [ADR-0046](DI-0046-ci-driven-image-tag-updates.md) | CI-Driven Image Tag Updates | Accepted | DI |
| [ADR-0047](DI-0047-playersonorleons-minimal-orleans-alternative.md) | PlayersOnOrleans — Minimal Orleans Alternative | Accepted | DI |
| [ADR-0048](DI-0048-per-app-istio-gateways.md) | Per-App Istio Gateways for Traffic Isolation | Accepted | DI |

## Format

Each ADR follows the template in [DI-0000-adr-template.md](DI-0000-adr-template.md), based on the [MADR](https://adr.github.io/madr/) format.
