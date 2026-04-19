using System.Diagnostics.Metrics;

namespace HelloAgents.Api.Telemetry;

public static class AppMetrics
{
    private static readonly Meter Meter = new("HelloAgents.App");

    // Gauges backing fields
    private static int _activeGroups;
    private static int _activeAgents;

    // Counters
    public static readonly Counter<long> MessagesTotal =
        Meter.CreateCounter<long>("helloagents.messages.total", description: "Total messages");

    public static readonly Counter<long> GroupsCreatedTotal =
        Meter.CreateCounter<long>("helloagents.groups.created.total", description: "Groups created");

    public static readonly Counter<long> GroupsDeletedTotal =
        Meter.CreateCounter<long>("helloagents.groups.deleted.total", description: "Groups deleted");

    public static readonly Counter<long> AgentsCreatedTotal =
        Meter.CreateCounter<long>("helloagents.agents.created.total", description: "Agents created");

    public static readonly Counter<long> AgentsDeletedTotal =
        Meter.CreateCounter<long>("helloagents.agents.deleted.total", description: "Agents deleted");

    public static readonly Counter<long> IntentsTotal =
        Meter.CreateCounter<long>("helloagents.intents.total", description: "LLM intents spawned");

    public static readonly Counter<long> IntentsFailed =
        Meter.CreateCounter<long>("helloagents.intents.failed", description: "Failed intents");

    public static readonly Counter<long> IntentsRetried =
        Meter.CreateCounter<long>("helloagents.intents.retried", description: "Retried intents");

    public static readonly Counter<long> IntentsExpired =
        Meter.CreateCounter<long>("helloagents.intents.expired", description: "Expired intents");

    public static readonly Counter<long> StreamEventsTotal =
        Meter.CreateCounter<long>("helloagents.stream.events.total", description: "Orleans stream events");

    // Histogram
    public static readonly Histogram<double> IntentDurationSeconds =
        Meter.CreateHistogram<double>("helloagents.intent.duration.seconds", unit: "s", description: "Intent execution duration");

    static AppMetrics()
    {
        Meter.CreateObservableGauge("helloagents.groups.active",
            () => Volatile.Read(ref _activeGroups),
            description: "Current active groups");

        Meter.CreateObservableGauge("helloagents.agents.active",
            () => Volatile.Read(ref _activeAgents),
            description: "Current active agents");
    }

    public static void SetActiveGroups(int count) => Interlocked.Exchange(ref _activeGroups, count);

    public static void SetActiveAgents(int count) => Interlocked.Exchange(ref _activeAgents, count);
}
