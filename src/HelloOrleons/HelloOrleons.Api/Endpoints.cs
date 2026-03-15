namespace HelloOrleons.Api;

public static class HelloEndpoints
{
    public static WebApplication MapHelloEndpoints(this WebApplication app)
    {
        app.MapGet("/hello/{name}", async (string name, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IHelloGrain>(name);
            var result = await grain.SayHello();
            return Results.Ok(result);
        });

        return app;
    }
}
