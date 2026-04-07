using Orleans;

namespace HelloOrleons.Api;

public interface IHelloGrain : IGrainWithStringKey
{
    Task<HelloResponse> SayHello();
}

[GenerateSerializer]
public sealed record HelloResponse(
    [property: Id(0)] string Name,
    [property: Id(1)] long Count);
