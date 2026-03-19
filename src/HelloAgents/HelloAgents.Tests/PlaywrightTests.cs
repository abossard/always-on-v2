// PlaywrightTests.cs — Runs Playwright E2E tests via Aspire.
// Aspire starts all resources, discovers URLs, then launches `npx playwright test`
// with the correct services__web__http__0. No hardcoded ports anywhere.

using System.Diagnostics;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using HelloAgents.AppHost;
using TUnit.Core.Interfaces;

namespace HelloAgents.Tests;

public class PlaywrightFixture : IAsyncInitializer, IAsyncDisposable
{
    DistributedApplication? _app;
    public Uri WebUrl { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.HelloAgents_AppHost>();

        _app = await builder.BuildAsync();
        await _app.StartAsync();
        await _app.ResourceNotifications.WaitForResourceHealthyAsync(ResourceNames.Web);
        WebUrl = _app.GetEndpoint(ResourceNames.Web);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}

[Category("e2e")]
[ClassDataSource<PlaywrightFixture>(Shared = SharedType.PerTestSession)]
public class PlaywrightTests(PlaywrightFixture fixture)
{
    [Test]
    [Retry(2)]
    public async Task Playwright_E2E_Suite_Passes()
    {
        var e2eDir = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "HelloAgents.E2E"));

        var psi = new ProcessStartInfo("npx", "playwright test")
        {
            WorkingDirectory = e2eDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["services__web__http__0"] = fixture.WebUrl.ToString().TrimEnd('/');
        psi.Environment["CI"] = "true";

        using var process = Process.Start(psi)!;
        var stdout = await process.StandardOutput.ReadToEndAsync();
        var stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (!string.IsNullOrWhiteSpace(stdout)) Console.WriteLine(stdout);
        if (!string.IsNullOrWhiteSpace(stderr)) Console.Error.WriteLine(stderr);

        await Assert.That(process.ExitCode).IsEqualTo(0);
    }
}
