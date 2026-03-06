using System.ComponentModel.DataAnnotations;
using Hydro;

namespace PlayersOnLevel0.Web.Components;

public class PlayerDashboard : HydroComponent
{
    // ── Player identity ──
    [Required, MaxLength(30)]
    public string PlayerName { get; set; } = "";

    public bool NameSaved { get; set; }

    // ── Stats ──
    public int Level { get; set; } = 1;
    public int Xp { get; set; }
    public int Strength { get; set; } = 5;
    public int Agility { get; set; } = 5;
    public int Intelligence { get; set; } = 5;
    public int Charisma { get; set; } = 5;

    // ── Achievements ──
    public List<AchievementVm> Achievements { get; set; } =
    [
        new("first-blood",   "First Blood",        "bi-droplet-fill",    false),
        new("speed-demon",   "Speed Demon",        "bi-lightning-fill",  false),
        new("big-brain",     "Big Brain Energy",   "bi-lightbulb-fill",  false),
        new("social-butterfly", "Social Butterfly", "bi-people-fill",    false),
        new("loot-goblin",   "Loot Goblin",        "bi-gem",             false),
        new("night-owl",     "Night Owl",          "bi-moon-fill",       false),
        new("dragon-slayer", "Dragon Slayer",       "bi-fire",           false),
        new("pacifist",      "Peaceful Soul",       "bi-peace-fill",     false),
    ];

    // ── XP helpers ──
    public int XpForNextLevel => Level * 100;
    public int XpPercent => XpForNextLevel > 0 ? Math.Min(100, Xp * 100 / XpForNextLevel) : 0;
    public int TotalStatPoints => Strength + Agility + Intelligence + Charisma;
    public string PlayerClass => (Strength, Agility, Intelligence, Charisma) switch
    {
        var (s, a, _, _) when s >= 8 && a >= 8 => "Berserker",
        var (s, _, _, _) when s >= 8            => "Warrior",
        var (_, a, _, _) when a >= 8            => "Rogue",
        var (_, _, i, _) when i >= 8            => "Mage",
        var (_, _, _, c) when c >= 8            => "Bard",
        _                                       => "Adventurer"
    };

    // ── Actions ──
    public void SaveName()
    {
        if (!Validate()) return;
        NameSaved = true;
    }

    public void ResetName()
    {
        PlayerName = "";
        NameSaved = false;
    }

    public void AddXp(int amount)
    {
        Xp += amount;
        while (Xp >= XpForNextLevel)
        {
            Xp -= XpForNextLevel;
            Level++;
        }
    }

    public void ToggleAchievement(string id)
    {
        var ach = Achievements.FirstOrDefault(a => a.Id == id);
        if (ach is not null)
            ach.Unlocked = !ach.Unlocked;
    }

    public void RandomizeStats()
    {
        var rng = Random.Shared;
        Strength = rng.Next(1, 11);
        Agility = rng.Next(1, 11);
        Intelligence = rng.Next(1, 11);
        Charisma = rng.Next(1, 11);
    }
}

public class AchievementVm
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Icon { get; set; }
    public bool Unlocked { get; set; }

    public AchievementVm() { Id = ""; Name = ""; Icon = ""; }
    public AchievementVm(string id, string name, string icon, bool unlocked)
    {
        Id = id; Name = name; Icon = icon; Unlocked = unlocked;
    }
}
