using System.Text.Json;

namespace GraphOrleons.Api;

/// <summary>
/// Pure merge logic for component properties. Testable without Orleans activation.
/// Returns a new dictionary — never mutates its inputs.
/// </summary>
public static class ComponentMerge
{
    public const int MaxProperties = 64;
    public const int MaxPropertyValueLength = 1024;

    /// <summary>
    /// Merges incoming payload properties into the existing merged state.
    /// Returns a new properties dictionary and whether at least one value changed.
    /// </summary>
    public static (Dictionary<string, MergedProperty> NewProperties, bool Changed) MergePayload(
        IReadOnlyDictionary<string, MergedProperty> properties,
        string payloadJson,
        DateTimeOffset now)
    {
        JsonElement root;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            root = doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return (new Dictionary<string, MergedProperty>(properties), false);
        }

        if (root.ValueKind != JsonValueKind.Object)
            return (new Dictionary<string, MergedProperty>(properties), false);

        var result = new Dictionary<string, MergedProperty>(properties);
        bool changed = false;

        foreach (var prop in root.EnumerateObject())
        {
            var value = prop.Value.ToString();
            if (value.Length > MaxPropertyValueLength)
                value = value[..MaxPropertyValueLength];

            if (result.TryGetValue(prop.Name, out var existing))
            {
                if (existing.Value != value)
                {
                    result[prop.Name] = new MergedProperty(value, now);
                    changed = true;
                }
                // else: same value — do not update timestamp
            }
            else
            {
                // Evict oldest if at capacity
                if (result.Count >= MaxProperties)
                {
                    EvictOldest(result);
                }

                result[prop.Name] = new MergedProperty(value, now);
                changed = true;
            }
        }

        return (result, changed);
    }

    private static void EvictOldest(Dictionary<string, MergedProperty> properties)
    {
        string? oldestKey = null;
        DateTimeOffset oldestTime = DateTimeOffset.MaxValue;

        foreach (var (key, prop) in properties)
        {
            if (prop.LastUpdated < oldestTime)
            {
                oldestTime = prop.LastUpdated;
                oldestKey = key;
            }
        }

        if (oldestKey is not null)
            properties.Remove(oldestKey);
    }
}
