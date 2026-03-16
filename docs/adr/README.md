# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for the AlwaysOn v2 Player Progression API.

## Index

| ADR  | Title                        | Status   |
|------|------------------------------|----------|
| 0000 | ADR Template                 | Accepted |
| 0001 | Compute Platform             | Accepted (Pre-defined) |
| 0002 | Application Framework        | Accepted (Pre-defined) |
| 0003 | Programming Language         | Accepted (Implied by 0002) |
| 0004 | Architecture Pattern         | Accepted (Pre-defined) |
| 0005 | Database Choice              | Proposed |
| 0006 | Messaging Platform           | Proposed |
| 0007 | Caching Strategy             | Proposed |
| 0008 | API Design Style             | Proposed |
| 0009 | Observability Stack          | Proposed |
| 0010 | Infrastructure as Code       | Proposed |
| 0011 | CI/CD Pipeline               | Proposed |
| 0012 | Multi-Region Strategy        | Proposed |
| 0013 | Data Consistency Model       | Proposed |
| 0014 | Security Approach            | Proposed |
| 0015 | Testing Strategy             | Proposed |
| 0016 | Container Strategy           | Proposed |
| 0017 | API Versioning               | Proposed |
| 0018 | Concurrency Handling         | Proposed |
| 0019 | Global Load Balancing        | Proposed |
| 0020 | Disaster Recovery            | Proposed |
| 0021 | Cost Management              | Proposed |
| 0022 | Secrets Management           | Proposed |
| 0023 | Data Access Patterns         | Proposed |
| 0024 | Deployment Strategy          | Proposed |
| 0025 | Rate Limiting                | Proposed |
| 0026 | PlayersOnLevel0 Lightweight API | Accepted |
| 0027 | Multi-Tenancy                  | Proposed |
| 0028 | Config Management              | Proposed |
| 0029 | Service Identity Wiring        | Proposed |
| 0030 | IaC Service Connector Placement | Proposed |
| 0031 | Cluster Bootstrapping          | Proposed |
| 0032 | Coding Principles              | Accepted |
| 0033 | Module Design                  | Accepted |
| 0034 | Simplified Hexagonal Architecture | Accepted |
| 0035 | File Organization              | Accepted |
| 0036 | Type-Safe Lookups              | Accepted |
| 0037 | Idempotent Finite State Machines | Accepted |
| 0038 | Matrix Testing                 | Accepted |
| 0039 | Orleans Ingress                | Accepted |
| 0040 | Global Application — Front Door as Multi-Silo Ingress | Accepted |
| 0041 | Accessibility-First Selectors for E2E Testing | Accepted |
| 0042 | Command Stream Storage Port for Click Processing | Proposed |
| 0043 | Event Reactors for Achievement Evaluation | Proposed |
| 0044 | Native AOT for PlayersOnLevel0 API | Accepted |
| 0045 | Flux Variable Substitution Conventions | Accepted |
| 0046 | CI-Driven Image Tag Updates | Accepted |
| 0047 | PlayersOnOrleans — Minimal Orleans Alternative | Accepted |
| 0048 | Per-App Istio Gateways for Traffic Isolation | Accepted |

## Format

Each ADR follows the template in [0000-adr-template.md](0000-adr-template.md), based on the [MADR](https://adr.github.io/madr/) format.
