using Orleans;

namespace HelloOrleons.Api;

public interface IHelloGrain : IGrainWithStringKey
{
    Task<string> SayHello();
}
