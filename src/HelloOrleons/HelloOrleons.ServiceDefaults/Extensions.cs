// Extensions.cs — ServiceDefaults: OpenTelemetry, health checks, resilience.
// Aspire convention: AddServiceDefaults() + MapDefaultEndpoints().
//
// Uses direct Azure Monitor exporter APIs (not UseAzureMonitor wrapper) because
// OTEL SDK 1.15+ no longer allows TracerProvider.AddProcessor() after build.
// See ADR-0053 for details.

using Azure.Identity;
using Azure.Monitor.OpenTelemetry.Exporter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;

namespace Microsoft.Extensions.Hosting;

public static class ServiceDefaultsExtensions
{
    public static IHostApplicationBuilder AddServiceDefaults(this IHostApplicationBuilder builder)
    {
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

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
            if (useAzureMonitor)
            {
                logging.AddAzureMonitorLogExporter(o => ConfigureExporter(o, connStr!));
            }
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddMeter("Microsoft.Orleans");
                if (useAzureMonitor)
                {
                    metrics.AddAzureMonitorMetricExporter(o => ConfigureExporter(o, connStr!));
                }
            })
            .WithTracing(tracing =>
            {
                tracing
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSource("Microsoft.Orleans.Runtime")
                    .AddSource("Microsoft.Orleans.Application");
                if (useAzureMonitor)
                {
                    tracing.AddAzureMonitorTraceExporter(o => ConfigureExporter(o, connStr!));
                }
            });

        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    static void ConfigureExporter(AzureMonitorExporterOptions options, string connectionString)
    {
        Console.WriteLine($"[OTEL] ConfigureExporter called — setting connection string and credential");
        options.ConnectionString = connectionString;
        options.Credential = new DefaultAzureCredential();
        options.DisableOfflineStorage = true;
    }

    static IHostApplicationBuilder AddDefaultHealthChecks(this IHostApplicationBuilder builder)
    {
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }
}
