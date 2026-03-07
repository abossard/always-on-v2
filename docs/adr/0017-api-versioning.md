# ADR-0017: API Versioning

## Status

Preference

## Context

As the API evolves across learning levels, breaking changes may be introduced. A versioning strategy ensures existing clients continue to work while new features are added. All options below are supported by the [Asp.Versioning.AspNetCore](https://www.nuget.org/packages/Asp.Versioning.AspNetCore) NuGet package.

## Options Considered

### Option 1: URL Path Versioning (`/api/v1/`)

Version embedded in the URL path (e.g., `/api/v1/players/{playerId}`).

- **Pros**: Highly visible and discoverable; cache-friendly (each version is a distinct URL); Front Door routing rules work naturally; easy to test in browsers and curl.
- **Cons**: URL changes on version bump; clients must update base URLs.

### Option 2: Query Parameter (`?api-version=1.0`)

Version passed as a query string parameter.

- **Pros**: Clean base URLs; used by Azure APIs; easy to default to latest version.
- **Cons**: CDN caching needs custom vary rules on the query parameter; less discoverable than path versioning.

### Option 3: HTTP Header (`api-version: 1.0`)

Version specified in a custom HTTP request header.

- **Pros**: Clean URLs; no URL changes between versions.
- **Cons**: Invisible to browsers; poor discoverability; harder to test with curl; Front Door routing requires header-based rules.

### Option 4: Content Negotiation (`Accept: application/vnd.app.v1+json`)

Version embedded in the media type via the `Accept` header.

- **Pros**: RESTful ideal; aligns with HTTP content negotiation semantics.
- **Cons**: Steep learning curve; minimal ASP.NET Core built-in support; hard to test in browsers.

### Option 5: No Versioning

Single API surface; all changes are backward-compatible or breaking.

- **Pros**: Simplest approach; no versioning infrastructure needed.
- **Cons**: Breaking changes affect all clients immediately; no migration path.

### Option 6: Semantic Versioning + Deprecation Headers

Use semantic versioning (`major.minor.patch`) with `Deprecation` and `Sunset` headers to signal upcoming removals.

- **Pros**: Graceful migration path; clients can detect deprecation programmatically.
- **Cons**: Discipline required to maintain versioning policy; clients must implement deprecation handling.

## Decision Criteria

- Client discoverability and ease of testing
- CDN caching compatibility (Front Door, Azure CDN)
- Front Door routing rule support
- ASP.NET Core library support (Asp.Versioning)
- Backward compatibility and migration path needs

## References

- [API Versioning Best Practices](https://learn.microsoft.com/azure/architecture/best-practices/api-design#versioning-a-restful-web-api)
- [Asp.Versioning.AspNetCore](https://github.com/dotnet/aspnet-api-versioning)
