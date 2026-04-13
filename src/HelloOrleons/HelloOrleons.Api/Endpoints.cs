namespace HelloOrleons.Api;

public static class HelloEndpoints
{
    public static WebApplication MapHelloEndpoints(this WebApplication app)
    {
        var redirectTarget = app.Environment.IsDevelopment() ? "/scalar/v1" : "/health";
        app.MapGet(Routes.Root, () => Results.Redirect(redirectTarget))
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
