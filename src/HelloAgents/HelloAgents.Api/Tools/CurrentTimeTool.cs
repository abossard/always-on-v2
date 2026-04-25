using System.Globalization;

namespace HelloAgents.Api.Tools;

public sealed class CurrentTimeTool : ITool
{
    public string Name => "current_time";

    public Task<string> ExecuteAsync(string input)
        => Task.FromResult(DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture));
}
