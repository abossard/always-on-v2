namespace HelloOrleons.Api;

public static class HelloEndpoints
{
    public static WebApplication MapHelloEndpoints(this WebApplication app)
    {
        app.MapGet(Routes.Root, () => Results.Redirect("/scalar/v1"))
            .ExcludeFromDescription();

        app.MapGet(Routes.HelloTemplate, async (string name, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IHelloGrain>(name);
            var result = await grain.SayHello();
            return Results.Ok(result);
        });

        return app;
    }
}
