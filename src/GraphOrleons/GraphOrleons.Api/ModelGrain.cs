using System.Text.Json;

namespace GraphOrleons.Api;

public sealed class ModelGrain : Grain, IModelGrain
{
    readonly HashSet<string> _nodes = [];
    readonly List<GraphEdge> _edges = [];

    public Task AddRelationships(string componentPath, string payloadJson)
    {
        var parts = componentPath.Split('/');
        if (parts.Length < 2) return Task.CompletedTask;

        var impact = Impact.None;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (doc.RootElement.TryGetProperty("impact", out var impactProp))
                Enum.TryParse<Impact>(impactProp.GetString(), ignoreCase: true, out impact);
        }
        catch { /* malformed JSON — keep default impact */ }

        for (int i = 0; i < parts.Length; i++)
        {
            _nodes.Add(parts[i]);
            if (i < parts.Length - 1)
            {
                var edge = new GraphEdge(parts[i], parts[i + 1], impact);
                _edges.RemoveAll(e => e.Source == edge.Source && e.Target == edge.Target);
                _edges.Add(edge);
            }
        }

        return Task.CompletedTask;
    }

    public Task<GraphSnapshot> GetGraph()
    {
        var key = this.GetPrimaryKeyString();
        var modelId = key[(key.IndexOf(':') + 1)..];
        return Task.FromResult(new GraphSnapshot(
            modelId,
            _nodes.Order().ToList(),
            _edges.ToList()));
    }
}
