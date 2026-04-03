// Extensions.cs — ServiceDefaults: OpenTelemetry, health checks, resilience.
// Aspire convention: AddServiceDefaults() + MapDefaultEndpoints().
// Uses Azure.Monitor.OpenTelemetry.AspNetCore distro (UseAzureMonitor).

using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;
using System.Diagnostics.Tracing;

namespace Microsoft.Extensions.Hosting;

public static class ServiceDefaultsExtensions
{
    public static IHostApplicationBuilder AddServiceDefaults(this IHostApplicationBuilder builder)
    {
        OtelDiagnosticsListener.Instance.ToString(); // ensure EventListener is active
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();
        builder.Services.AddServiceDiscovery();
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        builder.Services.AddOpenApi();

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapHealthChecks("/alive", new HealthCheckOptions { Predicate = r => r.Tags.Contains("live") });
            app.MapOpenApi();
            app.MapScalarApiReference();
        }

        app.MapHealthChecks("/health");

        return app;
    }

    static IHostApplicationBuilder ConfigureOpenTelemetry(this IHostApplicationBuilder builder)
    {
        var connStr = builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"];
        var useAzureMonitor = !string.IsNullOrEmpty(connStr);
        Console.WriteLine($"[OTEL] Azure Monitor: {(useAzureMonitor ? $"enabled (conn str len={connStr!.Length})" : "DISABLED — no connection string")}");

        if (useAzureMonitor)
        {
            builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
            {
                options.ConnectionString = connStr;
                options.Credential = new DefaultAzureCredential();
            });
        }

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddMeter("Microsoft.Orleans");
            })
            .WithTracing(tracing =>
            {
                tracing
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSource("Azure.*")
                    .AddSource("Microsoft.Orleans.Runtime")
                    .AddSource("Microsoft.Orleans.Application");
            });

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    static IHostApplicationBuilder AddDefaultHealthChecks(this IHostApplicationBuilder builder)
    {
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }
}

/// <summary>
/// Captures OpenTelemetry and Azure Monitor exporter EventSource diagnostics to stdout.
/// </summary>
sealed class OtelDiagnosticsListener : EventListener
{
    public static readonly OtelDiagnosticsListener Instance = new();

    protected override void OnEventSourceCreated(EventSource eventSource)
    {
        if (eventSource.Name is "OpenTelemetry-AzureMonitor-Exporter"
                             or "OpenTelemetry-Sdk"
                             or "Azure-Identity")
        {
            EnableEvents(eventSource, EventLevel.Informational, EventKeywords.All);
            Console.WriteLine($"[OTEL-Diag] Listening to EventSource: {eventSource.Name}");
        }
    }

    protected override void OnEventWritten(EventWrittenEventArgs e)
    {
        var msg = e.Message is not null && e.Payload?.Count > 0
            ? string.Format(e.Message, e.Payload.ToArray()!)
            : e.Message ?? e.EventName ?? "unknown";
        Console.WriteLine($"[OTEL-Diag] [{e.Level}] {e.EventSource.Name}: {msg}");
    }
}
