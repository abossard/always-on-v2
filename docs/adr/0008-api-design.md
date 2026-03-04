# ADR-0008: API Design Style

## Status

Proposed

## Context

The Player Progression API needs a well-defined interface for client communication. The API must be simple to consume, well-documented, cacheable, and compatible with Azure Front Door and Application Gateway.

## Options Under Consideration

### Option 1: REST with JSON

Standard RESTful HTTP APIs using JSON payloads, resource-oriented URLs, and OpenAPI/Swagger documentation.

- **Pros**: Universal client compatibility (browsers, mobile, CLI); Azure Front Door and CDN support HTTP caching natively; OpenAPI enables automatic client SDK generation; easy to test with curl/Postman; mature tooling ecosystem.
- **Cons**: JSON serialization overhead compared to binary protocols; no built-in streaming support; multiple round-trips for complex data needs.
- **Links**: [RESTful Web API Design](https://learn.microsoft.com/azure/architecture/best-practices/api-design) · [OpenAPI Specification](https://swagger.io/specification/)

### Option 2: gRPC (pure)

Binary Protocol Buffers over HTTP/2 with multiplexing, streaming, and strong typing via `.proto` contracts.

- **Pros**: Excellent performance (binary payloads, HTTP/2 multiplexing); built-in streaming (server, client, bidirectional); strongly typed contracts with code generation.
- **Cons**: No browser support without a bridge layer; no standard HTTP caching; Azure Front Door not optimized for gRPC; less tooling for ad-hoc testing.
- **Links**: [gRPC on .NET](https://learn.microsoft.com/aspnet/core/grpc/) · [gRPC Performance](https://learn.microsoft.com/aspnet/core/grpc/performance)

### Option 3: gRPC-Web

gRPC with a browser compatibility bridge, enabling binary payloads in browser clients via HTTP/1.1 or HTTP/2.

- **Pros**: Binary payloads accessible from browsers; same `.proto` contracts as pure gRPC; supported by Envoy and ASP.NET Core middleware.
- **Cons**: Requires proxy middleware; loses full HTTP/2 multiplexing benefits; smaller community than REST or pure gRPC.
- **Links**: [gRPC-Web in .NET](https://learn.microsoft.com/aspnet/core/grpc/grpcweb)

### Option 4: REST + gRPC hybrid

REST for external/public-facing clients, gRPC for internal service-to-service communication.

- **Pros**: Best of both worlds — browser-friendly external API with high-performance internal comms; each protocol used where it excels.
- **Cons**: Two protocol stacks to maintain, test, and document; contract duplication risk; increased team cognitive load.

### Option 5: GraphQL (HotChocolate)

Flexible query language allowing clients to request exactly the data they need, with subscription support.

- **Pros**: No over-fetching or under-fetching; single endpoint; built-in subscription support for real-time updates; strong .NET support via HotChocolate.
- **Cons**: Overkill for simple single-entity APIs; poor CDN caching (POST-only by default); complex rate limiting; N+1 query risk without DataLoader.
- **Links**: [HotChocolate GraphQL](https://chillicream.com/docs/hotchocolate)

### Option 6: OData

Standardized query language for REST APIs with built-in filtering, sorting, and pagination.

- **Pros**: Standardized $filter/$orderby/$select/$expand query syntax; built-in pagination; strong ASP.NET Core support.
- **Cons**: Smaller ecosystem than REST or GraphQL; complex cache keys due to query parameters; steeper learning curve for clients.
- **Links**: [OData in ASP.NET Core](https://learn.microsoft.com/odata/webapi-8/overview)

### Option 7: Minimal APIs vs Controller-based (ASP.NET implementation choice)

Both produce identical HTTP endpoints; Minimal APIs use a lighter code style while Controllers offer more structure.

- **Pros (Minimal APIs)**: Less boilerplate; faster startup; well-suited for simple APIs.
- **Pros (Controllers)**: Better for large APIs with many endpoints; built-in model validation, filters, and conventions.
- **Note**: This is an implementation choice orthogonal to the protocol decision above.
- **Links**: [Minimal APIs](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis) · [Controller-based APIs](https://learn.microsoft.com/aspnet/core/web-api/)

## Decision Criteria

- **Client compatibility** — Which clients must be supported (browsers, mobile, server-to-server)?
- **Azure Front Door / CDN compatibility** — Does the protocol support HTTP caching and Front Door routing?
- **Caching support** — Can responses be cached at the edge (CDN) and intermediaries?
- **Documentation generation** — Is automatic API documentation and client SDK generation available?
- **Performance needs** — Is binary serialization or streaming required for the expected payload sizes?
