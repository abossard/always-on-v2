using Aspire.Hosting;
using Aspire.Hosting.Testing;
using PlayersOnOrleons.AppHost;
using TUnit.Core.Interfaces;

namespace PlayersOnOrleons.Tests;

public sealed class ApiFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? app;

    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.PlayersOnOrleons_AppHost>();

        app = await builder.BuildAsync();
        await app.StartAsync();
        await app.ResourceNotifications.WaitForResourceHealthyAsync(ResourceNames.Api);
        Client = app.CreateHttpClient(ResourceNames.Api);
    }

    public async ValueTask DisposeAsync()
    {
        if (app is null) return;

        await app.StopAsync();
        await app.DisposeAsync();
    }
}