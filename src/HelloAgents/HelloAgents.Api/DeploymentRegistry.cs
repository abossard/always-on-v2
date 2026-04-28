namespace HelloAgents.Api;

public sealed record DeploymentInfo(string Name, string? Label = null);

#pragma warning disable CA1819 // Read-only list exposed via interface; concrete array kept internal.
public sealed class DeploymentRegistry
{
    public string DefaultDeployment { get; }
    public IReadOnlyList<DeploymentInfo> Deployments { get; }

    public DeploymentRegistry(IConfiguration config, ILogger<DeploymentRegistry>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(config);

        var deploymentsStr = config[ConfigKeys.AzureOpenAiDeployments];
        var defaultDeployment = config[ConfigKeys.AzureOpenAiDeployment] ?? "gpt-41-mini";

        if (!string.IsNullOrWhiteSpace(deploymentsStr))
        {
            var names = deploymentsStr.Split(
                ',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            Deployments = names.Length > 0
                ? names.Select(n => new DeploymentInfo(n)).ToArray()
                : [new DeploymentInfo(defaultDeployment)];
        }
        else
        {
            Deployments = [new DeploymentInfo(defaultDeployment)];
        }

        DefaultDeployment = Deployments.Any(d => string.Equals(d.Name, defaultDeployment, StringComparison.Ordinal))
            ? defaultDeployment
            : Deployments[0].Name;

        if (logger?.IsEnabled(LogLevel.Information) == true)
        {
            logger.LogInformation(
                "DeploymentRegistry initialized: default='{Default}', deployments=[{Deployments}] (source: {Source})",
                DefaultDeployment,
                string.Join(", ", Deployments.Select(d => d.Name)),
                string.IsNullOrWhiteSpace(deploymentsStr) ? "fallback" : ConfigKeys.AzureOpenAiDeployments);
        }
    }

    public bool IsValid(string? deployment) =>
        string.IsNullOrEmpty(deployment) ||
        Deployments.Any(d => string.Equals(d.Name, deployment, StringComparison.Ordinal));
}
#pragma warning restore CA1819
