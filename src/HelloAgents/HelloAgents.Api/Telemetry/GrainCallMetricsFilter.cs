using System.Diagnostics;
using System.Diagnostics.Metrics;
using Orleans;

namespace HelloAgents.Api.Telemetry;

/// <summary>
/// Orleans incoming grain call filter that records call count, duration, and error metrics for every grain invocation.
/// </summary>
public sealed class GrainCallMetricsFilter : IIncomingGrainCallFilter
{
    private static readonly Meter Meter = new("HelloAgents.GrainCalls");

    private static readonly Counter<long> CallCounter =
        Meter.CreateCounter<long>("helloagents.grain.calls.total");

    private static readonly Histogram<double> DurationHistogram =
        Meter.CreateHistogram<double>("helloagents.grain.call.duration.seconds");

    private static readonly Counter<long> ErrorCounter =
        Meter.CreateCounter<long>("helloagents.grain.errors.total");

    public async Task Invoke(IIncomingGrainCallContext context)
    {
        var grainType = context.Grain.GetType().Name;
        var method = context.ImplementationMethod.Name;
        var tags = new TagList
        {
            { "grain_type", grainType },
            { "method", method }
        };

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await context.Invoke();
        }
        catch
        {
            ErrorCounter.Add(1, tags);
            throw;
        }
        finally
        {
            stopwatch.Stop();
            DurationHistogram.Record(stopwatch.Elapsed.TotalSeconds, tags);
            CallCounter.Add(1, tags);
        }
    }
}
