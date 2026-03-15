namespace HelloOrleons.Api;

public sealed class HelloGrain : Grain, IHelloGrain
{
    public Task<string> SayHello() => Task.FromResult("World");
}
