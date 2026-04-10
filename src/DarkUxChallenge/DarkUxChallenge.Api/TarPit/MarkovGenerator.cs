// MarkovGenerator.cs — Generates infinite plausible fake data for tar pits.
// Seeded random for reproducibility; never runs out of content.

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

    private static readonly string[] Roles =
    [
        "superadmin", "admin", "backup-operator", "service-account", "dba",
        "read-all", "deploy-agent", "ci-runner", "security-auditor", "root"
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

    public static string GenerateUserRecord(Random rng)
    {
        var id = Guid.NewGuid();
        var first = FirstNames[rng.Next(FirstNames.Length)];
        var last = LastNames[rng.Next(LastNames.Length)];
        var domain = Domains[rng.Next(Domains.Length)];
        var tier = new[] { "free", "pro", "enterprise" }[rng.Next(3)];
        var token = $"sk_live_{Guid.NewGuid():N}"[..32];
        var created = DateTimeOffset.UtcNow.AddDays(-rng.Next(1, 730));

        return $$"""{"id":"{{id}}","name":"{{first}} {{last}}","email":"{{first.ToLower()}}.{{last.ToLower()[..1]}}@{{domain}}","tier":"{{tier}}","token":"{{token}}","completedLevels":{{rng.Next(0, 14)}},"lastActive":"{{created:O}}"}""";
    }

    public static string GenerateSecretRecord(Random rng)
    {
        var note = Notes[rng.Next(Notes.Length)];
        var secretTypes = new[]
        {
            $$"""{"name":"db-connection-{{rng.Next(1,20)}}","value":"Host=darkux-pg-{{rng.Next(1,5)}}.postgres.database.azure.com;Database=darkux_main;Username=app;Password={{Guid.NewGuid():N}}","env":"staging","note":"{{note}}"}""",
            $$"""{"name":"redis-cache","value":"darkux-redis-{{rng.Next(1,3)}}.redis.cache.windows.net:6380,password={{Guid.NewGuid():N}},ssl=True","env":"production"}""",
            $$"""{"name":"otel-key","value":"{{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"production","note":"{{note}}"}""",
            $$"""{"name":"storage-sas","value":"sv=2023-01-03&ss=b&srt=sco&sp=rwdlacitfx&se={{DateTimeOffset.UtcNow.AddDays(rng.Next(30, 180)):yyyy-MM-dd}}T00:00:00Z&sig={{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"staging"}""",
            $$"""{"name":"smtp-key","value":"SG.{{Guid.NewGuid():N}}.{{Convert.ToBase64String(Guid.NewGuid().ToByteArray())}}","env":"production","note":"{{note}}"}"""
        };
        return secretTypes[rng.Next(secretTypes.Length)];
    }

    public static string GenerateLogEntry(Random rng)
    {
        var level = LogLevels[rng.Next(LogLevels.Length)];
        var msg = LogMessages[rng.Next(LogMessages.Length)]
            .Replace("{user}", $"{FirstNames[rng.Next(FirstNames.Length)].ToLower()}")
            .Replace("{ip}", $"{IpPrefixes[rng.Next(IpPrefixes.Length)]}{rng.Next(1, 255)}.{rng.Next(1, 255)}")
            .Replace("{count}", $"{rng.Next(100, 99999)}")
            .Replace("{domain}", $"{Domains[rng.Next(Domains.Length)]}")
            .Replace("{days}", $"{rng.Next(1, 90)}")
            .Replace("{id}", $"{Guid.NewGuid():N}"[..8])
            .Replace("{duration}", $"{rng.Next(50, 12000)}");
        var ts = DateTimeOffset.UtcNow.AddSeconds(-rng.Next(0, 86400));
        var requestId = Guid.NewGuid().ToString("N")[..16];
        var traceId = Guid.NewGuid().ToString("N");

        return $$$"""{"timestamp":"{{{ts:O}}}","level":"{{{level}}}","message":"{{{msg}}}","requestId":"{{{requestId}}}","traceId":"{{{traceId}}}"}""";
    }

    public static string GenerateBackupRow(Random rng)
    {
        var tables = new[] { "users", "sessions", "audit_log", "api_keys", "roles", "permissions" };
        var table = tables[rng.Next(tables.Length)];
        return $$"""{"table":"{{table}}","rowId":{{rng.Next(1, 999999)}},"data":{{GenerateUserRecord(rng)}},"exportedAt":"{{DateTimeOffset.UtcNow:O}}"}""";
    }
}
