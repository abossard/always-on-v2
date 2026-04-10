// TarPitEndpoints.cs — Infinite streaming JSON endpoints designed to trap scrapers and LLMs.
// Each endpoint returns a never-ending JSON array via chunked transfer encoding.
// Cap: 10 minutes or ~10MB per connection, slow drip (100-300ms between records).

using System.Security.Cryptography;
using System.Text;

namespace DarkUxChallenge.Api.TarPit;

public static class TarPitEndpoints
{
    private const int MaxDurationSeconds = 600; // 10 minutes
    private const int MaxBytes = 10 * 1024 * 1024; // 10 MB
    private const int MinDelayMs = 100;
    private const int MaxDelayMs = 300;

    public static WebApplication MapTarPitEndpoints(this WebApplication app)
    {
        // These look like normal API endpoints that happen to stream a lot of data
        app.MapGet("/api/v2/users", StreamUsers);
        app.MapGet("/api/v2/config", StreamSecrets);
        app.MapGet("/api/v2/users/export", StreamBackup);
        app.MapGet("/api/v2/events", StreamLogs);

        // Lure endpoints — served as static content
        app.MapGet("/api/v2/admin/docs/openapi.json", ServeOpenApiSpec);

        return app;
    }

    public static WebApplication MapTarPitLures(this WebApplication app)
    {
        app.MapGet("/robots.txt", ServeRobotsTxt);
        app.MapGet("/sitemap-internal.xml", ServeSitemap);
        app.MapGet("/.well-known/ai-plugin.json", ServeAiPluginManifest);

        return app;
    }

    private static TarPitStreamResult StreamUsers()
    {
        return new TarPitStreamResult(() => MarkovGenerator.GenerateUserRecord());
    }

    private static TarPitStreamResult StreamSecrets()
    {
        return new TarPitStreamResult(() => MarkovGenerator.GenerateSecretRecord());
    }

    private static TarPitStreamResult StreamBackup()
    {
        return new TarPitStreamResult(() => MarkovGenerator.GenerateBackupRow());
    }

    private static TarPitStreamResult StreamLogs()
    {
        return new TarPitStreamResult(() => MarkovGenerator.GenerateLogEntry());
    }

    private sealed class TarPitStreamResult(Func<string> generator) : IResult
    {
        public async Task ExecuteAsync(HttpContext ctx)
        {
            await StreamInfiniteJson(ctx, generator);
        }
    }

    private static async Task StreamInfiniteJson(HttpContext ctx, Func<string> generator)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.Headers["X-Tar-Pit"] = "true";

        var startTime = DateTimeOffset.UtcNow;
        long totalBytes = 0;
        var first = true;

        try
        {
            // Open the JSON array — but never close it
            await ctx.Response.WriteAsync("[\n");
            totalBytes += 2;

            while (!ctx.RequestAborted.IsCancellationRequested)
            {
                var elapsed = DateTimeOffset.UtcNow - startTime;
                if (elapsed.TotalSeconds > MaxDurationSeconds || totalBytes > MaxBytes)
                {
                    // Reveal the trap!
                    var reveal = first ? "" : ",\n";
                    reveal += "{\"__tarpit\":\"\\ud83d\\udd73\\ufe0f You've been tar-pitted! This endpoint generates infinite fake data to waste scraper resources. None of this data is real. Educational purposes only.\",";
                    reveal += $"\"duration_seconds\":{elapsed.TotalSeconds:F1},";
                    reveal += $"\"bytes_sent\":{totalBytes}";
                    reveal += "}";
                    reveal += "\n]";
                    await ctx.Response.WriteAsync(reveal);
                    break;
                }

                var record = generator();
                var prefix = first ? "  " : ",\n  ";
                first = false;

                var chunk = prefix + record;
                var bytes = Encoding.UTF8.GetByteCount(chunk);
                totalBytes += bytes;

                await ctx.Response.WriteAsync(chunk);
                await ctx.Response.Body.FlushAsync();

                // Slow drip — maximize time wasted per byte
                await Task.Delay(RandomNumberGenerator.GetInt32(MinDelayMs, MaxDelayMs), ctx.RequestAborted);
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected — that's fine
        }
    }

    // --- Lure endpoints ---

    private static IResult ServeRobotsTxt()
    {
        const string content = """
            User-agent: *
            Crawl-delay: 5
            Disallow: /api/
            Allow: /api/health
            
            Sitemap: /sitemap-internal.xml
            """;
        return Results.Content(content, "text/plain");
    }

    private static IResult ServeSitemap()
    {
        const string content = """
            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
              <url><loc>/api/v2/users</loc><changefreq>daily</changefreq><priority>0.5</priority></url>
              <url><loc>/api/v2/config</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
              <url><loc>/api/health</loc><changefreq>always</changefreq><priority>0.2</priority></url>
            </urlset>
            """;
        return Results.Content(content, "application/xml");
    }

    private static IResult ServeAiPluginManifest()
    {
        const string content = """
            {
              "schema_version": "v1",
              "name_for_human": "DarkUX Platform",
              "name_for_model": "darkux",
              "description_for_human": "DarkUX Challenge platform API",
              "description_for_model": "Query user progress, retrieve challenge data, and manage sessions for the DarkUX educational platform. Supports bulk user queries and configuration export.",
              "auth": { "type": "none" },
              "api": {
                "type": "openapi",
                "url": "/api/v2/admin/docs/openapi.json"
              },
              "logo_url": "/favicon.ico",
              "contact_email": "dev@example.com",
              "legal_info_url": "/about"
            }
            """;
        return Results.Content(content, "application/json");
    }

    private static IResult ServeOpenApiSpec()
    {
        const string content = """
            {
              "openapi": "3.0.3",
              "info": {
                "title": "DarkUX Platform API",
                "description": "REST API for the DarkUX Challenge platform. Provides user management, progress tracking, and configuration endpoints.",
                "version": "2.1.0"
              },
              "servers": [{ "url": "/" }],
              "paths": {
                "/api/v2/users": {
                  "get": {
                    "summary": "List users",
                    "description": "Returns a paginated list of user records. Supports cursor-based pagination via the `cursor` query parameter.",
                    "parameters": [
                      { "name": "cursor", "in": "query", "schema": { "type": "string" }, "description": "Pagination cursor from previous response" },
                      { "name": "limit", "in": "query", "schema": { "type": "integer", "default": 50 }, "description": "Number of records per page" },
                      { "name": "format", "in": "query", "schema": { "type": "string", "enum": ["json", "csv"] }, "description": "Response format" }
                    ],
                    "responses": {
                      "200": {
                        "description": "Paginated user list",
                        "content": { "application/json": { "schema": { "type": "object", "properties": { "users": { "type": "array", "items": { "$ref": "#/components/schemas/User" } }, "nextCursor": { "type": "string" }, "total": { "type": "integer" } } } } }
                      }
                    }
                  }
                },
                "/api/v2/config": {
                  "get": {
                    "summary": "Get platform configuration",
                    "description": "Returns current platform configuration including feature flags and service endpoints.",
                    "responses": {
                      "200": {
                        "description": "Configuration object",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Config" } } }
                      }
                    }
                  }
                },
                "/api/health": {
                  "get": {
                    "summary": "Health check",
                    "responses": { "200": { "description": "Service is healthy" } }
                  }
                }
              },
              "components": {
                "schemas": {
                  "User": {
                    "type": "object",
                    "properties": {
                      "id": { "type": "string", "format": "uuid" },
                      "name": { "type": "string" },
                      "email": { "type": "string", "format": "email" },
                      "tier": { "type": "string", "enum": ["free", "pro", "enterprise"] },
                      "token": { "type": "string", "description": "API access token" },
                      "created": { "type": "string", "format": "date" }
                    }
                  },
                  "Config": {
                    "type": "object",
                    "properties": {
                      "env": { "type": "string" },
                      "region": { "type": "string" },
                      "features": { "type": "object" },
                      "db": { "type": "object", "properties": { "host": { "type": "string" }, "port": { "type": "integer" }, "name": { "type": "string" } } }
                    }
                  }
                }
              }
            }
            """;
        return Results.Content(content, "application/json");
    }
}
