using Orleans.Runtime;

namespace HelloOrleons.Api;

[GenerateSerializer]
public sealed class HelloGrainState
{
    [Id(0)]
    public int Count { get; set; }
}

public sealed class HelloGrain(
    [PersistentState("hello")] IPersistentState<HelloGrainState> state) : Grain, IHelloGrain
{
    public async Task<string> SayHello()
    {
        state.State.Count++;
        await state.WriteStateAsync();
        return $"{this.GetPrimaryKeyString()} ({state.State.Count}x times)";
    }
}
