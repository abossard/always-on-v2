// RateLimiting.cs — Token bucket rate limiter with fun 429 messages.

using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace DarkUxChallenge.Api;

public static class DarkUxRateLimiting
{
    private static readonly ConcurrentDictionary<string, TokenBucket> Buckets = new();

    private static readonly string[] FunnyMessages =
    [
        "🤖 Whoa there, Terminator. Take a breather.",
        "🚫 You're going faster than my intern. That's suspicious.",
        "⏳ Rate limit reached. Please solve this CAPTCHA: What is love?",
        "🐌 Slow down! Even bots need rest.",
        "🕳️ Keep going this fast and you'll fall into a tar pit...",
        "🍯 Honeypot says: you smell like a bot.",
        "418 I'm a teapot. And you're too fast. ☕",
        "🎮 Achievement unlocked: Rate Limited! Try the Konami code instead.",
        "📊 Your request velocity exceeds human-possible thresholds by 340%.",
        "🤔 Fun fact: the average human takes 2.3s between clicks. You took 0.04s."
    ];

    public static WebApplication UseRateLimiting(this WebApplication app, int capacity = 30, double refillPerSecond = 0.5)
    {
        app.Use(async (ctx, next) =>
        {
            var path = ctx.Request.Path.Value ?? "";

            // Only rate-limit challenge API endpoints, not tar pits (let those run!)
            if (!path.StartsWith("/api/levels/", StringComparison.Ordinal) && !path.StartsWith("/api/users/", StringComparison.Ordinal))
            {
                await next();
                return;
            }

            // Skip rate limiting in test environment (no remote IP = in-memory test server)
            var ip = ctx.Connection.RemoteIpAddress?.ToString();
            if (string.IsNullOrEmpty(ip) || ip == "::1" || ip == "127.0.0.1")
            {
                await next();
                return;
            }

            var bucket = Buckets.GetOrAdd(ip, _ => new TokenBucket(capacity, refillPerSecond));

            if (bucket.TryConsume())
            {
                await next();
                return;
            }

            ctx.Response.StatusCode = 429;
            ctx.Response.ContentType = "application/json";
            var message = FunnyMessages[RandomNumberGenerator.GetInt32(FunnyMessages.Length)];
            await ctx.Response.WriteAsync($$"""{"error":"rate_limited","message":"{{message}}","retryAfterSeconds":{{(int)(1.0 / refillPerSecond)}}}""");
        });

        return app;
    }

    private sealed class TokenBucket(int capacity, double refillPerSecond)
    {
        private double _tokens = capacity;
        private long _lastRefillTicks = DateTimeOffset.UtcNow.Ticks;
        private readonly object _lock = new();

        public bool TryConsume(int tokens = 1)
        {
            lock (_lock)
            {
                Refill();
                if (_tokens < tokens) return false;
                _tokens -= tokens;
                return true;
            }
        }

        private void Refill()
        {
            var now = DateTimeOffset.UtcNow.Ticks;
            var elapsed = (now - _lastRefillTicks) / (double)TimeSpan.TicksPerSecond;
            _tokens = Math.Min(capacity, _tokens + elapsed * refillPerSecond);
            _lastRefillTicks = now;
        }
    }
}
