# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for the AlwaysOn v2 platform.

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
| [ADR-0002](0002-multi-stamp-architecture-DI.md) | Multi-Region Strategy & Stamp Architecture | Decided | DI |
| [ADR-0003](0003-application-framework-DI.md) | Application Framework | Accepted (Pre-defined) | DI |
| [ADR-0004](0004-programming-language-DI.md) | Programming Language | Accepted (Implied by 0003) | DI |
| [ADR-0005](0005-architecture-pattern-UI.md) | Architecture Pattern | Accepted (Pre-defined) | UI |
| [ADR-0006](0006-database-choice-UI.md) | Database Choice | Proposed | UI |
| [ADR-0007](0007-messaging-platform-UNI.md) | Messaging Platform | Proposed | UNI |
| [ADR-0008](0008-caching-strategy-UNI.md) | Caching Strategy | Proposed | UNI |
| [ADR-0009](0009-api-design-UI.md) | API Design Style | Proposed | UI |
| [ADR-0010](0010-observability-stack-UI.md) | Observability Stack | Proposed | UI |
| [ADR-0011](0011-infrastructure-as-code-UI.md) | Infrastructure as Code | Proposed | UI |
| [ADR-0012](0012-cicd-pipeline-UI.md) | CI/CD Pipeline | Proposed | UI |
| [ADR-0014](0014-data-consistency-model-UI.md) | Data Consistency Model | Proposed | UI |
| [ADR-0015](0015-security-approach-UI.md) | Security Approach | Proposed | UI |
| [ADR-0016](0016-testing-strategy-UI.md) | Testing Strategy | Proposed | UI |
| [ADR-0017](0017-container-strategy-UI.md) | Container Strategy | Proposed | UI |
| [ADR-0018](0018-api-versioning-UNI.md) | API Versioning | Proposed | UNI |
| [ADR-0019](0019-concurrency-handling-UI.md) | Concurrency Handling | Proposed | UI |
| [ADR-0020](0020-global-load-balancing-UI.md) | Global Load Balancing | Proposed | UI |
| [ADR-0021](0021-disaster-recovery-UNI.md) | Disaster Recovery | Proposed | UNI |
| [ADR-0022](0022-cost-management-UI.md) | Cost Management | Proposed | UI |
| [ADR-0023](0023-secrets-management-UI.md) | Secrets Management | Proposed | UI |
| [ADR-0024](0024-data-access-patterns-UI.md) | Data Access Patterns | Proposed | UI |
| [ADR-0025](0025-deployment-strategy-UNI.md) | Deployment Strategy | Proposed | UNI |
| [ADR-0026](0026-rate-limiting-UI.md) | Rate Limiting | Proposed | UI |
| [ADR-0027](0027-playeronlevel0-lightweight-api-DI.md) | Lightweight API Pattern | Accepted | DI |
| [ADR-0028](0028-multi-tenancy-DNI.md) | Multi-Tenancy | Proposed | DNI |
| [ADR-0029](0029-config-management-UI.md) | Config Management | Proposed | UI |
| [ADR-0030](0030-service-identity-wiring-UI.md) | Service Identity Wiring | Proposed | UI |
| [ADR-0031](0031-iac-service-connector-placement-UNI.md) | IaC Service Connector Placement | Proposed | UNI |
| [ADR-0032](0032-cluster-bootstrapping-and-resource-management-UI.md) | Cluster Bootstrapping | Proposed | UI |
| [ADR-0033](0033-coding-principles-DI.md) | Coding Principles | Accepted | DI |
| [ADR-0034](0034-module-design-DI.md) | Module Design | Accepted | DI |
| [ADR-0035](0035-simplified-hexagonal-architecture-DI.md) | Simplified Hexagonal Architecture | Accepted | DI |
| [ADR-0036](0036-file-organization-DI.md) | File Organization | Accepted | DI |
| [ADR-0037](0037-type-safe-lookups-DI.md) | Type-Safe Lookups | Accepted | DI |
| [ADR-0038](0038-idempotent-finite-state-machines-DI.md) | Idempotent Finite State Machines | Accepted | DI |
| [ADR-0039](0039-matrix-testing-DI.md) | Matrix Testing | Accepted | DI |
| [ADR-0040](0040-orleans-ingress-DI.md) | Orleans Ingress | Accepted | DI |
| [ADR-0041](0041-global-application-frontdoor-ingress-DI.md) | Global Application — Front Door Ingress | Accepted | DI |
| [ADR-0042](0042-level0-integration-only-testing-DI.md) | Integration-Only Testing | Accepted | DI |
| [ADR-0043](0043-accessibility-first-e2e-selectors-DI.md) | Accessibility-First E2E Selectors | Accepted | DI |
| [ADR-0044](0044-command-stream-storage-port-UNI.md) | Command Stream Storage Port | Proposed | UNI |
| [ADR-0045](0045-event-reactors-for-achievements-UNI.md) | Event Reactors for Achievements | Proposed | UNI |
| [ADR-0046](0046-native-aot-for-level0-api-DI.md) | Native AOT for .NET APIs | Accepted | DI |
| [ADR-0047](0047-flux-variable-substitution-conventions-DI.md) | Flux Variable Substitution Conventions | Accepted | DI |
| [ADR-0048](0048-ci-driven-image-tag-updates-DI.md) | CI-Driven Image Tag Updates | Accepted | DI |
| [ADR-0049](0049-playersonorleons-minimal-orleans-alternative-DI.md) | PlayersOnOrleons — Minimal Orleans Alternative | Accepted | DI |
| [ADR-0050](0050-per-app-istio-gateways-DI.md) | Per-App Istio Gateways | Accepted | DI |
| [ADR-0051](0051-cicd-infrastructure-deployment-lessons-DarkUX.md) | CI/CD Deployment Lessons | Accepted | DI |
| [ADR-0052](0052-blue-green-stamp-lifecycle-DI.md) | Blue/Green Stamp Lifecycle | Accepted | DI |
| [ADR-0053](0053-direct-azure-monitor-otel-exporters-DI.md) | OpenTelemetry & Azure Monitor Configuration | Accepted | DI |
| [ADR-0054](0054-cosmos-emulator-https-protocol-aspire-13-2.md) | Cosmos Emulator Dev Cert Trust (Aspire 13.2) | Accepted | DI |
| [ADR-0055](0055-playersonorleons-shared-backend-abstraction.md) | Shared Backend Abstraction | Proposed | UNI |
| [ADR-0056](0056-helloorleons-write-behind-high-performance.md) | HelloOrleons Write-Behind Counter | Proposed | UNI |
| [ADR-0057](0057-node-memory-pressure-karpenter-low-memory-sku.md) | Node Memory Pressure — Karpenter SKU | Open | UI |
| [ADR-0058](0058-orleans-explicit-provider-config-DI.md) | Orleans Explicit Provider Config | Accepted | DI |
| [ADR-0059](0059-orleans-cosmos-aspire-known-issues-DI.md) | Orleans/Cosmos/Aspire Known Issues | Accepted | DI |
| [ADR-0060](0060-console-log-level-warning-only-DI.md) | Console Log Level — Warning Only | Accepted | DI |
| [ADR-0060](0060-prometheus-scraping-strategy-UI.md) | Prometheus Scraping Strategy | Proposed | UI |
| [ADR-0061](0061-orleans-per-stamp-cluster-scoping-UNI.md) | Orleans Per-Stamp Cluster Scoping | Proposed | UNI |

## Format

Each ADR follows the template in [0000-adr-template-DI.md](0000-adr-template-DI.md), based on the [MADR](https://adr.github.io/madr/) format.
