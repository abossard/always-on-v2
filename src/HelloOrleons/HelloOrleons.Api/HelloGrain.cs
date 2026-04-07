using Microsoft.Extensions.Options;
using Orleans.Runtime;

namespace HelloOrleons.Api;

[GenerateSerializer]
public sealed class HelloGrainState
{
    [Id(0)]
    public long Count { get; set; }

    [Id(1)]
    public long PendingCount { get; set; }
}

public sealed class HelloGrain(
    [PersistentState("hello")] IPersistentState<HelloGrainState> state,
    IOptions<GrainConfig> grainConfig) : Grain, IHelloGrain
{
    long _inMemoryCount;
    bool _dirty;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        // Recover: durable count + any pending increments from a previous crash
        _inMemoryCount = state.State.Count + state.State.PendingCount;
        _dirty = state.State.PendingCount > 0;

        var interval = TimeSpan.FromSeconds(grainConfig.Value.FlushIntervalSeconds);
        this.RegisterGrainTimer(FlushAsync, interval, interval);
        return Task.CompletedTask;
    }

    public Task<HelloResponse> SayHello()
    {
        _inMemoryCount++;
        _dirty = true;
        return Task.FromResult(new HelloResponse(this.GetPrimaryKeyString(), _inMemoryCount));
    }

    async Task FlushAsync()
    {
        if (!_dirty) return;

        // Phase 1: persist pending delta (crash-safe — PendingCount survives restart)
        state.State.PendingCount = _inMemoryCount - state.State.Count;
        await state.WriteStateAsync();

        // Phase 2: confirm — move pending into durable count
        state.State.Count = _inMemoryCount;
        state.State.PendingCount = 0;
        await state.WriteStateAsync();

        _dirty = false;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken ct)
    {
        await FlushAsync();
    }
}
