using Microsoft.Extensions.Options;
using Orleans.Runtime;

namespace HelloOrleons.Api;

[GenerateSerializer]
public sealed class HelloGrainState
{
    [Id(0)]
    public long Count { get; set; }
}

public sealed class HelloGrain(
    [PersistentState("hello")] IPersistentState<HelloGrainState> state,
    IOptions<GrainConfig> grainConfig) : Grain, IHelloGrain
{
    long _inMemoryCount;
    bool _dirty;

    public override Task OnActivateAsync(CancellationToken ct)
    {
        _inMemoryCount = state.State.Count;

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

        state.State.Count = _inMemoryCount;
        await state.WriteStateAsync();

        _dirty = false;
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken ct)
    {
        await FlushAsync();
    }
}
