using System.Globalization;
using System.Security.Cryptography;

namespace HelloAgents.Api.Tools;

public sealed class RandomNumberTool : ITool
{
    public string Name => "random_number";

    public Task<string> ExecuteAsync(string input)
    {
        var max = 100;
        if (!string.IsNullOrWhiteSpace(input)
            && int.TryParse(input.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            && parsed > 0)
        {
            max = parsed;
        }

        var value = RandomNumberGenerator.GetInt32(0, max);
        return Task.FromResult(value.ToString(CultureInfo.InvariantCulture));
    }
}
