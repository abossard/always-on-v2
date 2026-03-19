using System.ComponentModel;

namespace HelloAgents.Api;

public static class DummyTools
{
    [Description("Get the current server UTC time.")]
    public static string GetServerTime()
        => $"Current server time: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC";

    [Description("Get the weather for a given location (dummy data).")]
    public static string GetWeather(
        [Description("The city or location name.")] string location)
        => $"The weather in {location} is partly cloudy, 18°C with a gentle breeze.";

    [Description("Calculate a player's score based on clicks and level.")]
    public static string CalculateScore(
        [Description("Number of clicks.")] int clicks,
        [Description("Current player level.")] int level)
    {
        var score = clicks * level * 10;
        var rank = score switch
        {
            >= 10000 => "Legend",
            >= 5000 => "Master",
            >= 1000 => "Expert",
            >= 100 => "Apprentice",
            _ => "Novice"
        };
        return $"Score: {score} points (clicks={clicks}, level={level}, rank={rank})";
    }
}
