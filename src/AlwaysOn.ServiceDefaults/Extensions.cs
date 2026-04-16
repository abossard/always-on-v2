// Extensions.cs — ServiceDefaults: OpenTelemetry, health checks, resilience.
// Aspire convention: AddServiceDefaults() + MapDefaultEndpoints().
// Uses Azure.Monitor.OpenTelemetry.AspNetCore distro (UseAzureMonitor).

using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
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
        var otel = builder.Services.AddOpenTelemetry();

        if (!string.IsNullOrEmpty(connStr))
        {
            otel.UseAzureMonitor(options =>
            {
                options.ConnectionString = connStr;
                options.Credential = new DefaultAzureCredential();
                options.SamplingRatio = (float)builder.Configuration.GetValue("OTEL_TRACES_SAMPLER_ARG", 1.0);
            });
        }

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            otel.UseOtlpExporter();
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
