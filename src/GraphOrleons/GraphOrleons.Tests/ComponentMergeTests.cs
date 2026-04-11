using GraphOrleons.Api;

namespace GraphOrleons.Tests;

/// <summary>
/// Pure unit tests for ComponentMerge — no Orleans, no I/O.
/// </summary>
public class ComponentMergeTests
{
    static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    static readonly DateTimeOffset T1 = T0.AddSeconds(10);
    static readonly DateTimeOffset T2 = T0.AddSeconds(20);

    [Test]
    public async Task NewPropertyIsInserted()
    {
        var props = new Dictionary<string, MergedProperty>();
        var (result, changed) = ComponentMerge.MergePayload(props, """{"temp":"36.5"}""", T0);

        await Assert.That(changed).IsTrue();
        await Assert.That(result).ContainsKey("temp");
        await Assert.That(result["temp"].Value).IsEqualTo("36.5");
        await Assert.That(result["temp"].LastUpdated).IsEqualTo(T0);
        // Original dictionary is not mutated
        await Assert.That(props.Count).IsEqualTo(0);
    }

    [Test]
    public async Task UnchangedValueDoesNotRefreshTimestamp()
    {
        var props = new Dictionary<string, MergedProperty>
        {
            ["temp"] = new("36.5", T0)
        };

        var (result, changed) = ComponentMerge.MergePayload(props, """{"temp":"36.5"}""", T1);

        await Assert.That(changed).IsFalse();
        await Assert.That(result["temp"].LastUpdated).IsEqualTo(T0);
    }

    [Test]
    public async Task ChangedValueRefreshesTimestamp()
    {
        var props = new Dictionary<string, MergedProperty>
        {
            ["temp"] = new("36.5", T0)
        };

        var (result, changed) = ComponentMerge.MergePayload(props, """{"temp":"37.2"}""", T1);

        await Assert.That(changed).IsTrue();
        await Assert.That(result["temp"].Value).IsEqualTo("37.2");
        await Assert.That(result["temp"].LastUpdated).IsEqualTo(T1);
    }

    [Test]
    public async Task MultiplePropertiesMerged()
    {
        var props = new Dictionary<string, MergedProperty>();
        var (result, _) = ComponentMerge.MergePayload(props, """{"a":"1","b":"2"}""", T0);

        await Assert.That(result.Count).IsEqualTo(2);
        await Assert.That(result["a"].Value).IsEqualTo("1");
        await Assert.That(result["b"].Value).IsEqualTo("2");
    }

    [Test]
    public async Task OldestPropertyEvictedAt64()
    {
        var props = new Dictionary<string, MergedProperty>();
        // Fill to max
        for (int i = 0; i < ComponentMerge.MaxProperties; i++)
            props[$"p{i}"] = new($"{i}", T0.AddSeconds(i));

        await Assert.That(props.Count).IsEqualTo(64);

        // Add one more — oldest (p0) should be evicted
        var (result, changed) = ComponentMerge.MergePayload(props, """{"newProp":"x"}""", T2);

        await Assert.That(changed).IsTrue();
        await Assert.That(result.Count).IsEqualTo(64);
        await Assert.That(result).ContainsKey("newProp");
        await Assert.That(result.ContainsKey("p0")).IsFalse();
    }

    [Test]
    public async Task ValueTruncatedAtMaxLength()
    {
        var props = new Dictionary<string, MergedProperty>();
        var longValue = new string('x', 2000);
        var (result, _) = ComponentMerge.MergePayload(props, $$"""{"big":"{{longValue}}"}""", T0);

        await Assert.That(result["big"].Value.Length).IsEqualTo(ComponentMerge.MaxPropertyValueLength);
    }

    [Test]
    public async Task InvalidJsonReturnsFalse()
    {
        var props = new Dictionary<string, MergedProperty>();
        var (result, changed) = ComponentMerge.MergePayload(props, "not json", T0);

        await Assert.That(changed).IsFalse();
        await Assert.That(result.Count).IsEqualTo(0);
    }

    [Test]
    public async Task NonObjectJsonReturnsFalse()
    {
        var props = new Dictionary<string, MergedProperty>();
        var (_, changed) = ComponentMerge.MergePayload(props, """[1,2,3]""", T0);

        await Assert.That(changed).IsFalse();
    }
}
