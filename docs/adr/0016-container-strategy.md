# ADR-0016: Container Strategy

## Status

Proposed

## Context

The application runs on AKS and must be containerized. Container images must be secure (minimal attack surface), small (fast pull times across regions), and support non-root execution for Pod Security Standards compliance.

## Options Under Consideration

### Base Image

#### Option 1: `aspnet:9.0-noble-chiseled` (~80–120 MB)

Distroless Ubuntu "chiseled" image — no shell, no package manager, non-root by default.

- **Pros**: Smallest attack surface; fewest CVEs; non-root native; Microsoft-recommended for production.
- **Cons**: No shell for debugging (requires `kubectl debug` with ephemeral containers); limited to pre-installed dependencies.

#### Option 2: `aspnet:9.0-noble-chiseled-extra` (~150–180 MB)

Distroless chiseled image with globalization/ICU support included.

- **Pros**: Includes globalization libraries (ICU); non-root; distroless security benefits; good balance of size and compatibility.
- **Cons**: Larger than base chiseled; still no shell for debugging.

#### Option 3: `aspnet:9.0-alpine` (~100–140 MB)

Alpine Linux-based image using musl libc.

- **Pros**: Small image size; shell available for debugging; fewer CVEs than full distributions.
- **Cons**: musl libc can cause .NET compatibility issues (globalization, DNS resolution); different runtime behavior from glibc-based images.

#### Option 4: `aspnet:9.0-debian-slim` (~200–250 MB)

Debian slim base image with glibc and standard Linux tooling.

- **Pros**: Maximum .NET compatibility; familiar tooling; easiest debugging; broadest library support.
- **Cons**: Largest image size; more CVEs to patch; wider attack surface; slower pull times across regions.

#### Option 5: AOT-Specific Chiseled (~60–100 MB)

Native AOT-published application on a chiseled base — smallest possible image.

- **Pros**: Smallest image size; fastest startup; no .NET runtime dependency in image.
- **Cons**: AOT limitations (no reflection, no dynamic assembly loading); not all .NET libraries are AOT-compatible; Orleans AOT support may be limited.

### Build Approach

#### Option 1: Multi-Stage Dockerfile

Traditional Dockerfile with SDK build stage and runtime stage.

- **Pros**: Full control over build process and layer optimization; well-understood pattern; broad tooling support.
- **Cons**: Dockerfile maintenance; multi-stage builds slower than single-stage (mitigated by layer caching).

#### Option 2: `dotnet publish --PublishProfile=DefaultContainer`

SDK-native container publishing without a Dockerfile.

- **Pros**: Simplest approach; no Dockerfile to maintain; SDK manages image layers; integrated with `dotnet` CLI.
- **Cons**: Less control over layer optimization and image contents; newer feature with evolving capabilities.

#### Option 3: Paketo Buildpacks

Cloud Native Buildpacks that detect and build .NET applications without a Dockerfile.

- **Pros**: No Dockerfile needed; opinionated best practices; reproducible builds; CNCF standard.
- **Cons**: Slightly larger images; less control over image contents; smaller .NET community adoption; learning curve.

### Container Registry

#### Option 1: Azure Container Registry (ACR) Premium

Azure-native registry with geo-replication, content trust, and integrated RBAC.

- **Pros**: Geo-replication to all deployment regions (fastest AKS pull times); native Azure RBAC; integrated with AKS; content trust and image signing.
- **Cons**: ~$160/month; Azure-specific.

#### Option 2: Azure Container Registry (ACR) Standard

Azure-native registry without geo-replication.

- **Pros**: Azure-native RBAC and AKS integration; adequate for single-region or low-pull scenarios; ~$30/month.
- **Cons**: No geo-replication (cross-region pulls are slower); limited throughput for multi-region deployments.

#### Option 3: GitHub Container Registry (GHCR)

GitHub-native container registry with OIDC and GitHub Actions integration.

- **Pros**: Free tier available; native GitHub Actions OIDC integration; public image hosting; familiar GitHub permissions model.
- **Cons**: No geo-replication; potentially slower pulls from Azure regions; less Azure-native integration.

## Decision Criteria

- **Security posture**: How minimal is the attack surface? How many CVEs need ongoing patching?
- **Image size priority**: How important are fast pull times, especially across multiple regions?
- **Debugging needs**: Is shell access in production containers required or can ephemeral debug containers suffice?
- **.NET compatibility**: Are there workload-specific .NET requirements (globalization, reflection, dynamic loading)?
- **Multi-region pull speed**: How critical is pull latency for deployment speed and scaling across regions?
- **Cost**: What is the budget for registry infrastructure and geo-replication?

## References

- [.NET Container Images](https://learn.microsoft.com/dotnet/core/docker/container-images)
- [Chiseled Ubuntu Containers](https://devblogs.microsoft.com/dotnet/announcing-dotnet-chiseled-containers/)
- [ACR Geo-Replication](https://learn.microsoft.com/azure/container-registry/container-registry-geo-replication)
- [.NET SDK Container Publishing](https://learn.microsoft.com/dotnet/core/docker/publish-as-container)
- [Paketo .NET Buildpack](https://paketo.io/docs/howto/dotnet-core/)
