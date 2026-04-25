using System.Data;
using System.Globalization;

namespace HelloAgents.Api.Tools;

/// <summary>Evaluates simple arithmetic expressions using DataTable.Compute.</summary>
public sealed class CalculatorTool : ITool
{
    public string Name => "calculator";

    public Task<string> ExecuteAsync(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return Task.FromResult("0");

        try
        {
            using var table = new DataTable { Locale = CultureInfo.InvariantCulture };
            var result = table.Compute(input, null);
            return Task.FromResult(Convert.ToString(result, CultureInfo.InvariantCulture) ?? "");
        }
#pragma warning disable CA1031
        catch (Exception ex)
#pragma warning restore CA1031
        {
            return Task.FromResult($"error: {ex.Message}");
        }
    }
}
