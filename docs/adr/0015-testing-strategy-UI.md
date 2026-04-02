# ADR-0015: Testing Strategy

## Status

Proposed

## Context

The project requires validation of functional requirements, non-functional requirements (throughput, latency, availability), security, and resilience. A comprehensive testing strategy must cover development-time tests, pre-deployment validation, and production validation. Tool choices are presented per testing layer.

## Options Under Consideration

### Unit Testing Frameworks

#### xUnit

Community-standard .NET test framework; used by the .NET team itself.

- **Pros**: Most popular in .NET ecosystem; excellent tooling support; constructor-based setup; parallel test execution by default.
- **Cons**: No built-in assertion messages by default; test class lifecycle differs from NUnit/MSTest.
- **Cost**: Free / open-source.

#### NUnit

Mature .NET testing framework with rich assertion and attribute model.

- **Pros**: Rich constraint-based assertion model; extensive attributes for parameterized tests; long track record.
- **Cons**: Less commonly used in newer .NET projects; slightly different conventions from xUnit.
- **Cost**: Free / open-source.

#### MSTest

Microsoft's built-in test framework, shipped with Visual Studio.

- **Pros**: First-class Visual Studio integration; Microsoft-supported; familiar to enterprise .NET developers.
- **Cons**: Historically less flexible than xUnit/NUnit; smaller open-source community.
- **Cost**: Free / included with Visual Studio.

### Mocking Frameworks

#### NSubstitute

Fluent, low-ceremony mocking library for .NET.

- **Pros**: Clean syntax; easy to learn; good error messages; works well with xUnit and NUnit.
- **Cons**: Cannot mock non-virtual members without wrappers.
- **Cost**: Free / open-source.

#### Moq

Widely-used .NET mocking framework based on lambda expressions.

- **Pros**: Most popular .NET mocking library; extensive documentation; LINQ-to-Mocks syntax.
- **Cons**: Recent controversy over telemetry (SponsorLink); lambda syntax can be verbose.
- **Cost**: Free / open-source.

#### FakeItEasy

Intuitive mocking library with a focus on discoverability.

- **Pros**: Highly discoverable API; good documentation; consistent syntax.
- **Cons**: Smaller community than Moq; fewer Stack Overflow answers.
- **Cost**: Free / open-source.

### Assertion Libraries

#### FluentAssertions

Fluent assertion library providing expressive, readable test assertions.

- **Pros**: Highly readable assertions; excellent error messages; broad type support; extension methods.
- **Cons**: Additional dependency; licensing changed in v7 (commercial license for some uses).
- **Cost**: Free for open-source; commercial license may apply for v7+.

#### Shouldly

Assertion library that focuses on error message clarity.

- **Pros**: Clear error messages showing expected vs actual; simple API.
- **Cons**: Fewer assertion types than FluentAssertions; smaller community.
- **Cost**: Free / open-source.

#### Built-in Assertions (Assert class)

Assertions provided by the test framework itself (xUnit.Assert, NUnit.Assert, MSTest.Assert).

- **Pros**: No additional dependency; always available; zero learning curve for framework users.
- **Cons**: Less expressive; error messages can be cryptic; limited fluent chaining.
- **Cost**: Free / included with framework.

### Orleans Testing

#### TestCluster (`Microsoft.Orleans.TestingHost`)

Full Orleans test cluster running in-process for integration testing of grain interactions.

- **Pros**: Tests real grain lifecycle, activation, and persistence; official Microsoft library; closest to production behavior.
- **Cons**: Slower startup; heavier resource usage; test isolation requires careful setup.
- **Cost**: Free / included with Orleans.

#### In-Memory Grain Testing

Direct grain unit testing by mocking grain dependencies and state.

- **Pros**: Fast execution; true unit isolation; no Orleans runtime overhead.
- **Cons**: Does not test grain activation/deactivation lifecycle; may miss runtime integration issues.
- **Cost**: Free.

#### .NET Aspire Testing (`Aspire.Hosting.Testing`)

Integration testing using Aspire's distributed application model.

- **Pros**: Tests full application topology; manages service dependencies; aligns with Aspire hosting model.
- **Cons**: Newer ecosystem; requires Aspire adoption; heavier than TestCluster for grain-only tests.
- **Cost**: Free / open-source.

### Integration Testing

#### WebApplicationFactory

ASP.NET Core's built-in test server for in-process HTTP integration testing.

- **Pros**: In-process; fast; no external dependencies; official Microsoft pattern; tests full middleware pipeline.
- **Cons**: Does not test containerized deployment; limited to single-service testing.
- **Cost**: Free / included with ASP.NET Core.

#### TestContainers

Library for spinning up real Docker containers (databases, message brokers) during tests.

- **Pros**: Tests against real infrastructure; disposable containers; language-agnostic; broad service support.
- **Cons**: Requires Docker; slower than in-memory alternatives; CI/CD Docker-in-Docker complexity.
- **Cost**: Free / open-source.

#### .NET Aspire Testing

Distributed application integration testing using Aspire orchestration.

- **Pros**: Manages full service dependency graph; integrates with Aspire's service discovery; production-like topology.
- **Cons**: Requires Aspire adoption; newer tooling with evolving APIs.
- **Cost**: Free / open-source.

### Load Testing

#### k6

JavaScript-based load testing tool by Grafana Labs.

- **Pros**: Developer-friendly JavaScript scripting; excellent CLI; built-in metrics; good CI/CD integration; protocol support (HTTP, WebSocket, gRPC).
- **Cons**: JavaScript-only scripting; limited .NET-specific integrations.
- **Cost**: Free / open-source (cloud version is paid).

#### Locust

Python-based distributed load testing framework.

- **Pros**: Python scripting; distributed mode; real-time web UI; easy to extend.
- **Cons**: Python dependency; less .NET ecosystem alignment; single-threaded per worker.
- **Cost**: Free / open-source.

#### Azure Load Testing

Managed Azure service for load testing with JMeter support.

- **Pros**: Managed infrastructure; Azure-native integration; auto-scales; integrates with Application Insights; supports JMeter scripts.
- **Cons**: Azure-only; pay-per-use cost; less scripting flexibility than k6.
- **Cost**: Pay-per-virtual-user-hour.

#### NBomber

.NET-native load testing framework.

- **Pros**: Written in .NET; first-class C#/F# support; plugin architecture; integrates naturally with .NET projects.
- **Cons**: Smaller community than k6; fewer protocol plugins.
- **Cost**: Free / open-source.

#### JMeter

Java-based load testing tool with a GUI and extensive protocol support.

- **Pros**: Mature; broad protocol support; large community; Azure Load Testing compatible.
- **Cons**: XML-based test plans; Java dependency; resource-heavy; GUI is clunky.
- **Cost**: Free / open-source.

#### Gatling

Scala/Java-based load testing tool with code-as-configuration.

- **Pros**: Excellent HTML reports; code-based scenarios; good CI/CD integration; efficient resource usage.
- **Cons**: Scala/Java dependency; learning curve for non-JVM developers.
- **Cost**: Free / open-source (enterprise version is paid).

### Chaos Engineering

#### Azure Chaos Studio

Managed Azure service for running chaos experiments against Azure resources.

- **Pros**: Azure-native; managed service; supports AKS, Cosmos DB, networking faults; built-in safety controls.
- **Cons**: Azure-only; limited to supported fault types; cost.
- **Cost**: Pay-per-experiment-minute.

#### Chaos Mesh

Kubernetes-native chaos engineering platform (CNCF incubating).

- **Pros**: Kubernetes-native; rich fault types (pod, network, IO, time); web dashboard; CNCF project.
- **Cons**: Requires installation on cluster; Kubernetes-only; operational overhead.
- **Cost**: Free / open-source.

#### LitmusChaos

Kubernetes-native chaos engineering framework with a ChaosHub of experiments.

- **Pros**: ChaosHub experiment catalog; Kubernetes-native; GitOps-friendly; CNCF project.
- **Cons**: Heavier installation; steeper learning curve; less mature than Chaos Mesh.
- **Cost**: Free / open-source.

#### Gremlin

Commercial chaos engineering platform with managed infrastructure.

- **Pros**: Managed SaaS; broad target support (containers, VMs, cloud services); safety controls; team collaboration features.
- **Cons**: Commercial cost; external dependency; data leaves cluster.
- **Cost**: Commercial subscription.

### Security Scanning

#### Trivy

Open-source vulnerability scanner for containers, filesystems, and IaC.

- **Pros**: Free; broad scanning (CVEs, secrets, IaC misconfigurations); fast; CI/CD friendly; large vulnerability database.
- **Cons**: No managed dashboard; community-supported.
- **Cost**: Free / open-source.

#### Snyk

Commercial developer security platform covering vulnerabilities, licenses, and code.

- **Pros**: Developer-focused UX; fix suggestions; license compliance; IDE integration; container and dependency scanning.
- **Cons**: Commercial cost for full features; external SaaS dependency.
- **Cost**: Free tier available; paid plans for teams.

#### Gitleaks

Secret detection tool for Git repositories.

- **Pros**: Focused on secret detection; fast; pre-commit hook support; CI/CD friendly.
- **Cons**: Only detects secrets (not CVEs or misconfigurations); configuration tuning needed to reduce false positives.
- **Cost**: Free / open-source.

#### Microsoft Defender for Containers

Azure-native container security with runtime protection and vulnerability assessment.

- **Pros**: Azure-native; ACR image scanning; AKS runtime protection; integrated with Azure Security Center.
- **Cons**: Azure-only; additional Azure cost; limited customization.
- **Cost**: Included with Defender for Cloud plans.

#### OWASP ZAP

Open-source web application security scanner for dynamic analysis (DAST).

- **Pros**: Free; comprehensive DAST scanning; active community; CI/CD integration; API scanning support.
- **Cons**: Can be noisy (false positives); requires tuning; does not scan containers or IaC.
- **Cost**: Free / open-source.

### Contract Testing

#### Pact

Consumer-driven contract testing framework.

- **Pros**: Ensures API compatibility between services; consumer-driven; supports multiple languages; Pact Broker for sharing contracts.
- **Cons**: Overhead for single-API projects; requires both consumer and provider adoption.
- **Cost**: Free / open-source (Pactflow SaaS is paid).

#### Spectral

API linting and validation tool for OpenAPI specifications.

- **Pros**: Validates API design against rulesets; customizable rules; CI/CD friendly; catches design issues early.
- **Cons**: Static analysis only (does not test runtime behavior); limited to OpenAPI/AsyncAPI specs.
- **Cost**: Free / open-source.

### Mutation Testing

#### Stryker.NET

Mutation testing framework for .NET that measures test suite effectiveness.

- **Pros**: Measures real test quality (not just coverage); identifies weak tests; .NET-native; detailed reports.
- **Cons**: Very slow (runs test suite per mutation); high resource usage; best suited for critical code paths only.
- **Cost**: Free / open-source.

## Decision Criteria

- **CI/CD pipeline integration**: How easily does the tool integrate with the chosen CI/CD platform?
- **.NET/Orleans compatibility**: Does the tool work naturally with .NET and Orleans workloads?
- **Cost**: What is the total cost of ownership (licensing, infrastructure, maintenance)?
- **Operational overhead**: How much effort is required to set up, maintain, and interpret results?
- **Compliance requirements**: Does the tool satisfy any regulatory or organizational testing mandates?

## References

- [Testing in .NET](https://learn.microsoft.com/dotnet/core/testing/)
- [Orleans Testing](https://learn.microsoft.com/dotnet/orleans/implementation/testing)
- [Azure Chaos Studio](https://learn.microsoft.com/azure/chaos-studio/chaos-studio-overview)
- [k6 Load Testing](https://k6.io/docs/)
- [Chaos Mesh](https://chaos-mesh.org/)
- [Trivy](https://aquasecurity.github.io/trivy/)
- [Stryker.NET](https://stryker-mutator.io/docs/stryker-net/introduction/)
