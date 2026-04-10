// MarkovGenerator.cs — Generates infinite plausible fake data for tar pits.
// Seeded random for reproducibility; never runs out of content.

using System.Globalization;
using System.Security.Cryptography;

namespace DarkUxChallenge.Api.TarPit;

public static class MarkovGenerator
{
    private static readonly string[] FirstNames =
    [
        "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank",
        "Ivy", "Jack", "Karen", "Leo", "Maya", "Nick", "Olivia", "Peter",
        "Quinn", "Rachel", "Steve", "Tanya", "Uma", "Victor", "Wendy", "Xander"
    ];

    private static readonly string[] LastNames =
    [
        "Johnson", "Smith", "Williams", "Brown", "Jones", "Garcia", "Miller",
        "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore",
        "Jackson", "White", "Harris", "Martin", "Thompson", "Robinson"
    ];

    private static readonly string[] Domains =
    [
        "darkux.internal", "vault.test", "staging.local", "pipeline.dev",
        "cluster.internal", "observability.io", "admin.corp", "ci.darkux.dev",
        "backup.internal", "monitoring.local", "secrets.vault", "db.darkux.io"
    ];

    private static readonly string[] Notes =
    [
        "auto-created", "migrated from v1", "pending review",
        "rotate quarterly", "managed identity planned", "temp access",
        "CI pipeline", "shared service account",
        "staging only", "monitoring"
    ];

    private static readonly string[] LogLevels = ["INFO", "WARN", "ERROR", "DEBUG", "FATAL"];

    private static readonly string[] LogMessages =
    [
        "User authentication successful for {user}",
        "Failed login attempt from {ip} — rate limit applied",
        "Database connection pool exhausted — scaling up",
        "API key rotated for service account {user}",
        "Unexpected error in /api/admin/export: NullReferenceException",
        "Backup completed: {count} records exported to blob storage",
        "Certificate expiry warning: {domain} expires in {days} days",
        "Rate limiter triggered for client {ip} — 429 returned",
        "Deployment {id} completed successfully in {duration}ms",
        "Memory pressure detected: GC gen2 collection triggered"
    ];

    private static readonly string[] IpPrefixes = ["10.0.", "172.16.", "192.168.", "10.1."];

    public static string GenerateUserRecord()
    {
        var id = Guid.NewGuid();
        var first = FirstNames[RandomNumberGenerator.GetInt32(FirstNames.Length)];
        var last = LastNames[RandomNumberGenerator.GetInt32(LastNames.Length)];
        var domain = Domains[RandomNumberGenerator.GetInt32(Domains.Length)];
        var tier = new[] { "free", "pro", "enterprise" }[RandomNumberGenerator.GetInt32(3)];
        var token = $"sk_live_{Guid.NewGuid():N}"[..32];
        var created = DateTimeOffset.UtcNow.AddDays(-RandomNumberGenerator.GetInt32(1, 730));

#pragma warning disable CA1308 // Normalize strings to uppercase — emails are intentionally lowercase
        var emailFirst = first.ToLower(CultureInfo.InvariantCulture);
        var emailLast = last.ToLower(CultureInfo.InvariantCulture)[..1];
#pragma warning restore CA1308
        return $$"""{"id":"{{id}}","name":"{{first}} {{last}}","email":"{{emailFirst}}.{{emailLast}}@{{domain}}","tier":"{{tier}}","token":"{{token}}","completedLevels":{{RandomNumberGenerator.GetInt32(0, 14)}},"lastActive":"{{created:O}}"}""";
    }

    public static string GenerateSecretRecord()
    {
        var note = Notes[RandomNumberGenerator.GetInt32(Notes.Length)];
        var secretTypes = new[]
        {
            $$"""{"name":"db-connection-{{RandomNumberGenerator.GetInt32(1,20)}}","value":"Host=darkux-pg-{{RandomNumberGenerator.GetInt32(1,5)}}.postgres.database.azure.com;Database=darkux_main;Username=app;Password={{Guid.NewGuid():N}}","env":"staging","note":"{{note}}"}""",
            $$"""{"name":"redis-cache","value":"darkux-redis-{{RandomNumberGenerator.GetInt32(1,3)}}.redis.cache.windows.net:6380,password={{Guid.NewGuid():N}},ssl=True","env":"production"}""",
            $$"""{"name":"otel-key","value":"{{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"production","note":"{{note}}"}""",
            $$"""{"name":"storage-sas","value":"sv=2023-01-03&ss=b&srt=sco&sp=rwdlacitfx&se={{DateTimeOffset.UtcNow.AddDays(RandomNumberGenerator.GetInt32(30, 180)):yyyy-MM-dd}}T00:00:00Z&sig={{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"staging"}""",
            $$"""{"name":"smtp-key","value":"SG.{{Guid.NewGuid():N}}.{{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"production","note":"{{note}}"}"""
        };
        return secretTypes[RandomNumberGenerator.GetInt32(secretTypes.Length)];
    }

    public static string GenerateLogEntry()
    {
        var level = LogLevels[RandomNumberGenerator.GetInt32(LogLevels.Length)];
#pragma warning disable CA1308 // Normalize strings to uppercase — usernames are intentionally lowercase
        var msg = LogMessages[RandomNumberGenerator.GetInt32(LogMessages.Length)]
            .Replace("{user}", FirstNames[RandomNumberGenerator.GetInt32(FirstNames.Length)].ToLower(CultureInfo.InvariantCulture), StringComparison.Ordinal)
#pragma warning restore CA1308
            .Replace("{ip}", $"{IpPrefixes[RandomNumberGenerator.GetInt32(IpPrefixes.Length)]}{RandomNumberGenerator.GetInt32(1, 255)}.{RandomNumberGenerator.GetInt32(1, 255)}", StringComparison.Ordinal)
            .Replace("{count}", $"{RandomNumberGenerator.GetInt32(100, 99999)}", StringComparison.Ordinal)
            .Replace("{domain}", $"{Domains[RandomNumberGenerator.GetInt32(Domains.Length)]}", StringComparison.Ordinal)
            .Replace("{days}", $"{RandomNumberGenerator.GetInt32(1, 90)}", StringComparison.Ordinal)
            .Replace("{id}", $"{Guid.NewGuid():N}"[..8], StringComparison.Ordinal)
            .Replace("{duration}", $"{RandomNumberGenerator.GetInt32(50, 12000)}", StringComparison.Ordinal);
        var ts = DateTimeOffset.UtcNow.AddSeconds(-RandomNumberGenerator.GetInt32(0, 86400));
        var requestId = Guid.NewGuid().ToString("N")[..16];
        var traceId = Guid.NewGuid().ToString("N");

        return $$$"""{"timestamp":"{{{ts:O}}}","level":"{{{level}}}","message":"{{{msg}}}","requestId":"{{{requestId}}}","traceId":"{{{traceId}}}"}""";
    }

    public static string GenerateBackupRow()
    {
        var tables = new[] { "users", "sessions", "audit_log", "api_keys", "roles", "permissions" };
        var table = tables[RandomNumberGenerator.GetInt32(tables.Length)];
        return $$"""{"table":"{{table}}","rowId":{{RandomNumberGenerator.GetInt32(1, 999999)}},"data":{{GenerateUserRecord()}},"exportedAt":"{{DateTimeOffset.UtcNow:O}}"}""";
    }
}
