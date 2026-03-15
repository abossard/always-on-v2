namespace HelloOrleons.Api;

public static class HelloEndpoints
{
    public static WebApplication MapHelloEndpoints(this WebApplication app)
    {
        app.MapGet("/", () => Results.Content("""
            <!DOCTYPE html>
            <html><head><title>HelloOrleons</title></head>
            <body>
              <h1>HelloOrleons</h1>
              <p>Try it: <a href="/hello/world">/hello/world</a></p>
            </body></html>
            """, "text/html"));

        app.MapGet("/hello/{name}", async (string name, IGrainFactory grains) =>
        {
            var grain = grains.GetGrain<IHelloGrain>(name);
            var result = await grain.SayHello();
            return Results.Ok(result);
        });

        return app;
    }
}
