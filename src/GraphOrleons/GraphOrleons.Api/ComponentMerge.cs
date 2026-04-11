using System.Text.Json;

namespace GraphOrleons.Api;

/// <summary>
/// Pure merge logic for component properties. Testable without Orleans activation.
/// </summary>
public static class ComponentMerge
{
    public const int MaxProperties = 64;
    public const int MaxPropertyValueLength = 1024;

    /// <summary>
    /// Merges incoming payload properties into the existing merged state.
    /// Returns true if at least one property value actually changed (effective change).
    /// </summary>
    public static bool MergePayload(
        Dictionary<string, MergedProperty> properties,
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
            return false;
        }

        if (root.ValueKind != JsonValueKind.Object)
            return false;

        bool changed = false;

        foreach (var prop in root.EnumerateObject())
        {
            var value = prop.Value.ToString();
            if (value.Length > MaxPropertyValueLength)
                value = value[..MaxPropertyValueLength];

            if (properties.TryGetValue(prop.Name, out var existing))
            {
                if (existing.Value != value)
                {
                    existing.Value = value;
                    existing.LastUpdated = now;
                    changed = true;
                }
                // else: same value — do not update timestamp
            }
            else
            {
                // Evict oldest if at capacity
                if (properties.Count >= MaxProperties)
                {
                    EvictOldest(properties);
                }

                properties[prop.Name] = new MergedProperty
                {
                    Value = value,
                    LastUpdated = now
                };
                changed = true;
            }
        }

        return changed;
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
