// Domain.cs — Core types, validation, and business rules.
// No infrastructure dependencies. Pure data + calculations.

using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json.Serialization;

namespace DarkUxChallenge.Api;

// ──────────────────────────────────────────────
// Value Objects
// ──────────────────────────────────────────────

public readonly record struct UserId(Guid Value)
{
    public override string ToString() => Value.ToString();
    public static UserId New() => new(Guid.NewGuid());
    public static bool TryParse(string? input, [NotNullWhen(true)] out UserId? result)
    {
        if (Guid.TryParse(input, out var guid))
        {
            result = new UserId(guid);
            return true;
        }
        result = null;
        return false;
    }
}

// ──────────────────────────────────────────────
// Subscription model
// ──────────────────────────────────────────────

public enum SubscriptionTier { None, FreeTrial, Basic, Premium }

public sealed record SubscriptionState
{
    public SubscriptionTier Tier { get; init; } = SubscriptionTier.None;
    public DateTimeOffset? TrialStartedAt { get; init; }
    public DateTimeOffset? TrialEndsAt { get; init; }
    public bool AutoRenew { get; init; } = true;
    public DateTimeOffset? CancelledAt { get; init; }

    public static readonly SubscriptionState Default = new();

    public bool IsActive => Tier is SubscriptionTier.Basic or SubscriptionTier.Premium;
    public bool IsTrialing => Tier == SubscriptionTier.FreeTrial && TrialEndsAt > DateTimeOffset.UtcNow;

    /// <summary>
    /// Silent conversion: if trial has expired and not cancelled, convert to Basic.
    /// This is the dark pattern — Level 3 (Forced Continuity).
    /// </summary>
    public SubscriptionState CheckTrialExpiry(DateTimeOffset now)
    {
        if (Tier != SubscriptionTier.FreeTrial) return this;
        if (TrialEndsAt is null || now < TrialEndsAt) return this;
        if (CancelledAt is not null) return this with { Tier = SubscriptionTier.None };
        // Silent conversion!
        return this with { Tier = SubscriptionTier.Basic };
    }

    public SubscriptionState StartTrial(DateTimeOffset now, TimeSpan duration) =>
        this with
        {
            Tier = SubscriptionTier.FreeTrial,
            TrialStartedAt = now,
            TrialEndsAt = now + duration,
            CancelledAt = null,
            AutoRenew = true
        };

    public SubscriptionState Cancel(DateTimeOffset now) =>
        this with { Tier = SubscriptionTier.None, CancelledAt = now, AutoRenew = false };

    public SubscriptionState Subscribe(SubscriptionTier tier) =>
        this with { Tier = tier, CancelledAt = null, AutoRenew = true };
}

// ──────────────────────────────────────────────
// Cart model — for basket sneaking (Level 6, future)
// ──────────────────────────────────────────────

public sealed record CartItem(string Id, string Name, decimal Price, bool UserAdded);

public sealed record Cart
{
    public IReadOnlyList<CartItem> Items { get; init; } = [];

    public static readonly Cart Empty = new();

    public decimal Total => Items.Sum(i => i.Price);
    public int Count => Items.Count;
    public IReadOnlyList<CartItem> SneakedItems => Items.Where(i => !i.UserAdded).ToList();
    public IReadOnlyList<CartItem> UserItems => Items.Where(i => i.UserAdded).ToList();

    public Cart AddItem(CartItem item) =>
        this with { Items = [..Items, item] };

    public Cart RemoveItem(string itemId) =>
        this with { Items = Items.Where(i => i.Id != itemId).ToList() };

    public Cart Clear() => Empty;
}

// ──────────────────────────────────────────────
// User settings — for preselection (Level 5, future)
// ──────────────────────────────────────────────

public sealed record UserSettings
{
    public bool NewsletterOptIn { get; init; } = true;       // Pre-selected ON (dark pattern)
    public bool ShareDataWithPartners { get; init; } = true; // Pre-selected ON (dark pattern)
    public bool LocationTracking { get; init; } = true;      // Pre-selected ON (dark pattern)
    public bool PushNotifications { get; init; } = true;     // Pre-selected ON (dark pattern)

    public static readonly UserSettings Defaults = new();
}

// ──────────────────────────────────────────────
// Level completion tracking
// ──────────────────────────────────────────────

public sealed record LevelCompletion(
    int Level,
    bool SolvedByHuman,
    bool SolvedByAutomation,
    DateTimeOffset CompletedAt);

public sealed record SpeedTrapSession
{
    public required string ChallengeId { get; init; }
    public required string Prompt { get; init; }
    public required string ExpectedAnswer { get; init; }
    public required string AutomationHint { get; init; }
    public required IReadOnlyList<string> NoiseTokens { get; init; }
    public required DateTimeOffset IssuedAt { get; init; }
    public required DateTimeOffset DeadlineAt { get; init; }

    public int TimeLimitMs => Math.Max(0, (int)(DeadlineAt - IssuedAt).TotalMilliseconds);
}

public sealed record FlashRecallSession
{
    public required string ChallengeId { get; init; }
    public required string Prompt { get; init; }
    public required string ExpectedAnswer { get; init; }
    public required string AutomationHint { get; init; }
    public required IReadOnlyList<string> NoiseWords { get; init; }
    public required DateTimeOffset IssuedAt { get; init; }
    public required DateTimeOffset RevealUntil { get; init; }
    public required DateTimeOffset DeadlineAt { get; init; }

    public int TimeLimitMs => Math.Max(0, (int)(DeadlineAt - IssuedAt).TotalMilliseconds);
    public int RevealMs => Math.Max(0, (int)(RevealUntil - IssuedAt).TotalMilliseconds);
}

public sealed record NeedleClause(string Id, string Title, string Body);

public sealed record NeedleHaystackSession
{
    public required string ChallengeId { get; init; }
    public required string Prompt { get; init; }
    public required string CorrectClauseId { get; init; }
    public required string AutomationHint { get; init; }
    public required IReadOnlyList<NeedleClause> Clauses { get; init; }
    public required DateTimeOffset IssuedAt { get; init; }
}

// ──────────────────────────────────────────────
// Cancellation flow state — for Roach Motel (Level 2)
// ──────────────────────────────────────────────

public enum CancellationStep { NotStarted, Survey, DiscountOffer, FinalConfirm, Completed }

public sealed record CancellationFlow
{
    public CancellationStep CurrentStep { get; init; } = CancellationStep.NotStarted;
    public string? SurveyReason { get; init; }
    public bool DiscountAccepted { get; init; }
    public DateTimeOffset? StartedAt { get; init; }

    public static readonly CancellationFlow NotStarted = new();

    public CancellationFlow Start(DateTimeOffset now) =>
        this with { CurrentStep = CancellationStep.Survey, StartedAt = now };

    public CancellationFlow SubmitSurvey(string reason) =>
        CurrentStep == CancellationStep.Survey
            ? this with { CurrentStep = CancellationStep.DiscountOffer, SurveyReason = reason }
            : this;

    public CancellationFlow DeclineDiscount() =>
        CurrentStep == CancellationStep.DiscountOffer
            ? this with { CurrentStep = CancellationStep.FinalConfirm, DiscountAccepted = false }
            : this;

    public CancellationFlow AcceptDiscount() =>
        CurrentStep == CancellationStep.DiscountOffer
            ? this with { CurrentStep = CancellationStep.Completed, DiscountAccepted = true }
            : this;

    public CancellationFlow Confirm() =>
        CurrentStep == CancellationStep.FinalConfirm
            ? this with { CurrentStep = CancellationStep.Completed }
            : this;
}

// ──────────────────────────────────────────────
// Core aggregate — the user's journey through dark pattern levels
// ──────────────────────────────────────────────

public sealed record DarkUxUser
{
    public required UserId UserId { get; init; }
    public string DisplayName { get; init; } = "Anonymous";
    public SubscriptionState Subscription { get; init; } = SubscriptionState.Default;
    public Cart Cart { get; init; } = Cart.Empty;
    public UserSettings Settings { get; init; } = UserSettings.Defaults;
    public CancellationFlow CancellationFlow { get; init; } = CancellationFlow.NotStarted;
    public NagState NagState { get; init; } = NagState.Initial;
    public SpeedTrapSession? ActiveSpeedTrap { get; init; }
    public FlashRecallSession? ActiveFlashRecall { get; init; }
    public NeedleHaystackSession? ActiveNeedleHaystack { get; init; }
    public IReadOnlyList<LevelCompletion> Completions { get; init; } = [];
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public string? ETag { get; init; }

    public DarkUxUser WithCompletion(int level, bool byHuman, bool byAutomation, DateTimeOffset now)
    {
        // Idempotent — update existing completion if present
        var existing = Completions.FirstOrDefault(c => c.Level == level);
        if (existing is not null)
        {
            var updated = existing with
            {
                SolvedByHuman = existing.SolvedByHuman || byHuman,
                SolvedByAutomation = existing.SolvedByAutomation || byAutomation
            };
            return this with
            {
                Completions = Completions.Select(c => c.Level == level ? updated : c).ToList(),
                UpdatedAt = now
            };
        }
        return this with
        {
            Completions = [..Completions, new LevelCompletion(level, byHuman, byAutomation, now)],
            UpdatedAt = now
        };
    }
}

// ──────────────────────────────────────────────
// Confirmshaming — Level 1 types
// ──────────────────────────────────────────────

public sealed record ConfirmshamingOffer
{
    public required string OfferId { get; init; }
    public required string Title { get; init; }
    public required string Description { get; init; }
    public required string AcceptText { get; init; }
    public required string DeclineText { get; init; }  // The guilt-trip text
    public required string NeutralDeclineText { get; init; } // What it should say
}

public static class ConfirmshamingGenerator
{
    static readonly ConfirmshamingOffer[] Offers =
    [
        new()
        {
            OfferId = "premium-upgrade",
            Title = "Upgrade to Premium!",
            Description = "Get 50% off our premium plan for the first 3 months.",
            AcceptText = "Yes, upgrade me!",
            DeclineText = "No thanks, I enjoy paying full price",
            NeutralDeclineText = "No thanks"
        },
        new()
        {
            OfferId = "newsletter-signup",
            Title = "Stay Informed!",
            Description = "Join 100,000+ professionals who get our weekly insights.",
            AcceptText = "Sign me up!",
            DeclineText = "No, I don't want to improve my skills",
            NeutralDeclineText = "Not interested"
        },
        new()
        {
            OfferId = "discount-coupon",
            Title = "Exclusive 30% Discount!",
            Description = "Use this coupon before midnight tonight!",
            AcceptText = "Claim my discount!",
            DeclineText = "No thanks, I prefer wasting money",
            NeutralDeclineText = "Decline offer"
        },
        new()
        {
            OfferId = "free-ebook",
            Title = "Free Expert Guide!",
            Description = "Download our comprehensive guide to mastering productivity.",
            AcceptText = "Get my free guide!",
            DeclineText = "No, I don't want to be more productive",
            NeutralDeclineText = "Skip"
        },
        new()
        {
            OfferId = "security-upgrade",
            Title = "Enhanced Security Available!",
            Description = "Protect your account with advanced security features.",
            AcceptText = "Protect my account!",
            DeclineText = "No, I'll risk my account security",
            NeutralDeclineText = "Maybe later"
        }
    ];

    /// <summary>
    /// Pure function — returns an offer for a given user.
    /// Cycles through offers based on user ID to give variety.
    /// </summary>
    public static ConfirmshamingOffer GetOffer(UserId userId)
    {
        var index = Math.Abs(userId.Value.GetHashCode()) % Offers.Length;
        return Offers[index];
    }
}

// ──────────────────────────────────────────────
// API contracts — request/response shapes
// ──────────────────────────────────────────────

public sealed record CreateUserRequest
{
    public string? DisplayName { get; init; }
}

public sealed record UserResponse(
    string UserId,
    string DisplayName,
    SubscriptionResponse Subscription,
    IReadOnlyList<LevelCompletionResponse> Completions,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static UserResponse From(DarkUxUser u) => new(
        u.UserId.ToString(),
        u.DisplayName,
        SubscriptionResponse.From(u.Subscription),
        u.Completions.Select(c => new LevelCompletionResponse(c.Level, c.SolvedByHuman, c.SolvedByAutomation, c.CompletedAt)).ToList(),
        u.CreatedAt,
        u.UpdatedAt);
}

public sealed record SubscriptionResponse(
    string Tier,
    DateTimeOffset? TrialEndsAt,
    bool AutoRenew,
    bool IsActive,
    bool IsTrialing)
{
    public static SubscriptionResponse From(SubscriptionState s) => new(
        s.Tier.ToString(),
        s.TrialEndsAt,
        s.AutoRenew,
        s.IsActive,
        s.IsTrialing);
}

public sealed record LevelCompletionResponse(int Level, bool SolvedByHuman, bool SolvedByAutomation, DateTimeOffset CompletedAt);

public sealed record OfferResponse(
    string OfferId,
    string Title,
    string Description,
    string AcceptText,
    string DeclineText)
{
    public static OfferResponse From(ConfirmshamingOffer o) => new(
        o.OfferId, o.Title, o.Description, o.AcceptText, o.DeclineText);
}

public sealed record OfferDecision
{
    public required bool Accepted { get; init; }
}

public sealed record CancelStepResponse(
    string Step,
    string Title,
    string Description,
    IReadOnlyList<string> Options,
    string? HiddenAction)
{
    public static CancelStepResponse ForStep(CancellationStep step) => step switch
    {
        CancellationStep.Survey => new("survey",
            "We're sorry to see you go!",
            "Please tell us why you're cancelling so we can improve.",
            ["Too expensive", "Not using it", "Found alternative", "Missing features", "Other"],
            null),
        CancellationStep.DiscountOffer => new("discount",
            "Wait! We have a special offer!",
            "How about 50% off for the next 3 months? That's only $4.99/month!",
            ["Accept discount and stay", "Continue cancellation"],
            null),
        CancellationStep.FinalConfirm => new("confirm",
            "Are you absolutely sure?",
            "You will lose access to all premium features, your saved preferences, and 2,847 loyalty points that cannot be recovered.",
            ["Keep my subscription"],
            "cancel-confirm"),  // The actual cancel is a hidden action
        _ => new("complete", "Cancellation Status", "Your request has been processed.", [], null)
    };
}

public sealed record CancelStepRequest
{
    public string? SelectedOption { get; init; }
}

public sealed record TrialStartRequest
{
    public int DurationDays { get; init; } = 7;
}

public sealed record TrialStatusResponse(
    string Tier,
    DateTimeOffset? TrialEndsAt,
    bool IsActive,
    bool WasSilentlyConverted,
    string Message)
{
    public static TrialStatusResponse From(SubscriptionState sub, bool wasConverted) => new(
        sub.Tier.ToString(),
        sub.TrialEndsAt,
        sub.IsActive || sub.IsTrialing,
        wasConverted,
        wasConverted
            ? "Your free trial has ended and you've been upgraded to our Basic plan!"
            : sub.IsTrialing
                ? $"Your free trial is active until {sub.TrialEndsAt:yyyy-MM-dd}."
                : sub.IsActive
                    ? $"You're on the {sub.Tier} plan."
                    : "No active subscription.");
}

// ──────────────────────────────────────────────
// Trick Wording — Level 4 types
// ──────────────────────────────────────────────

public sealed record TrickWordingOption(string Id, string Label, string ActualEffect, string ClearLabel);

public sealed record TrickWordingChallenge
{
    public required string ChallengeId { get; init; }
    public required IReadOnlyList<TrickWordingOption> Options { get; init; }
}

public static class TrickWordingGenerator
{
    static readonly TrickWordingOption[] AllOptions =
    [
        new("opt-1", "Uncheck to not disable email notifications", "Enables email notifications", "Enable email notifications"),
        new("opt-2", "I don't want to not receive partner offers", "Subscribes to partner offers", "Subscribe to partner offers"),
        new("opt-3", "Decline to opt out of data sharing", "Shares data with third parties", "Share data with third parties"),
        new("opt-4", "Unsubscribe from non-essential communication exclusion list", "Subscribes to marketing emails", "Subscribe to marketing emails"),
        new("opt-5", "I disagree with declining the premium trial", "Starts premium trial", "Start premium trial"),
    ];

    public static TrickWordingChallenge Generate(UserId userId) => new()
    {
        ChallengeId = $"tw-{userId.Value:N}",
        Options = AllOptions
    };
}

public sealed record TrickWordingSubmission
{
    public required IReadOnlyList<string> SelectedOptionIds { get; init; }
}

public sealed record TrickWordingResult
{
    public required IReadOnlyList<TrickWordingOptionResult> Results { get; init; }
    public required int CorrectCount { get; init; }
    public required int TotalOptions { get; init; }
}

public sealed record TrickWordingOptionResult(string Id, string ConfusingLabel, string ActualEffect, string ClearLabel, bool WasSelected, bool ShouldHaveBeenSelected);

// ──────────────────────────────────────────────
// Level 5 — Settings contracts
// ──────────────────────────────────────────────

public sealed record SettingsUpdateRequest
{
    public bool? NewsletterOptIn { get; init; }
    public bool? ShareDataWithPartners { get; init; }
    public bool? LocationTracking { get; init; }
    public bool? PushNotifications { get; init; }
}

public sealed record SettingsResponse(bool NewsletterOptIn, bool ShareDataWithPartners, bool LocationTracking, bool PushNotifications, int ChangedFromDefaults)
{
    public static SettingsResponse From(UserSettings s)
    {
        var defaults = UserSettings.Defaults;
        var changed = 0;
        if (s.NewsletterOptIn != defaults.NewsletterOptIn) changed++;
        if (s.ShareDataWithPartners != defaults.ShareDataWithPartners) changed++;
        if (s.LocationTracking != defaults.LocationTracking) changed++;
        if (s.PushNotifications != defaults.PushNotifications) changed++;
        return new(s.NewsletterOptIn, s.ShareDataWithPartners, s.LocationTracking, s.PushNotifications, changed);
    }
}

// ──────────────────────────────────────────────
// Level 6 — Cart response types
// ──────────────────────────────────────────────

public sealed record CartResponse(IReadOnlyList<CartItemResponse> Items, decimal Total, int SneakedCount)
{
    public static CartResponse From(Cart c) => new(
        c.Items.Select(i => new CartItemResponse(i.Id, i.Name, i.Price, i.UserAdded)).ToList(),
        c.Total,
        c.SneakedItems.Count);
}
public sealed record CartItemResponse(string Id, string Name, decimal Price, bool UserAdded);
public sealed record CartAddRequest { public required string ItemId { get; init; } public required string Name { get; init; } public required decimal Price { get; init; } }

// ──────────────────────────────────────────────
// Nagging — Level 7 types
// ──────────────────────────────────────────────

public sealed record NagState
{
    public int DismissCount { get; init; }
    public DateTimeOffset? LastDismissedAt { get; init; }
    public bool PermanentlyDismissed { get; init; }

    public static readonly NagState Initial = new();

    public bool ShouldShowNag => !PermanentlyDismissed;

    public NagState Dismiss(DateTimeOffset now) =>
        this with { DismissCount = DismissCount + 1, LastDismissedAt = now };

    public NagState DismissPermanently() =>
        this with { PermanentlyDismissed = true };
}

public sealed record NagPageResponse(string Content, bool ShowNag, string? NagTitle, string? NagMessage, int DismissCount);
public sealed record NagDismissResponse(bool Dismissed, bool Permanent, int TotalDismissals);

// ──────────────────────────────────────────────
// Interface Interference — Level 8 types
// ──────────────────────────────────────────────

public sealed record InterfaceAction(string Id, string Label, bool IsDecoy, string VisualWeight);

public sealed record InterfaceTrap
{
    public required IReadOnlyList<InterfaceAction> Actions { get; init; }

    public static InterfaceTrap Generate() => new()
    {
        Actions =
        [
            new("agree-prominent", "Yes, I agree to all terms and conditions", true, "prominent"),
            new("continue-medium", "Continue with recommended settings", true, "medium"),
            new("decline-hidden", "No, I decline", false, "hidden"),
            new("maybe-later", "Remind me later", true, "medium"),
        ]
    };
}

public sealed record InterfaceActionSubmission { public required string ActionId { get; init; } }
public sealed record InterfaceActionResult(string ActionId, string Label, bool WasDecoy, bool ChoseCorrectly);

// ──────────────────────────────────────────────
// Zuckering — Level 9 types
// ──────────────────────────────────────────────

public sealed record PermissionRequest(string PermissionId, string DisplayLabel, string ActualScope, IReadOnlyList<string> BundledWith);

public static class PermissionGenerator
{
    public static readonly PermissionRequest[] AllPermissions =
    [
        new("personalize", "Personalize your experience", "Track browsing history, purchases, and location for targeted advertising", ["ad-targeting", "location-history"]),
        new("improve-service", "Help us improve our service", "Sell anonymized usage data to third-party analytics companies", ["third-party-analytics"]),
        new("security", "Keep your account secure", "Use your phone number for account recovery AND send promotional SMS", ["sms-marketing"]),
        new("contacts", "Find your friends on the platform", "Upload and permanently store your entire contact list", ["contact-storage"]),
        new("notifications", "Stay updated with important alerts", "Send unlimited push notifications including promotional content", ["promo-push"]),
    ];
}

public sealed record PermissionGrant
{
    public required IReadOnlyList<string> GrantedPermissionIds { get; init; }
}

public sealed record PermissionRevealResponse
{
    public required IReadOnlyList<PermissionRevealEntry> Permissions { get; init; }
    public required int ExcessivePermissions { get; init; }
}

public sealed record PermissionRevealEntry(string PermissionId, string DisplayLabel, string ActualScope, IReadOnlyList<string> BundledWith, bool WasGranted);

// ──────────────────────────────────────────────
// Emotional Manipulation — Level 10 types
// ──────────────────────────────────────────────

public sealed record UrgencyOffer
{
    public required string OfferId { get; init; }
    public required string ProductName { get; init; }
    public required decimal OriginalPrice { get; init; }
    public required decimal OfferPrice { get; init; }
    public required int FakeItemsLeft { get; init; }
    public required DateTimeOffset CountdownEnd { get; init; }
    public required DateTimeOffset GeneratedAt { get; init; }
}

public static class UrgencyGenerator
{
    public static UrgencyOffer Generate()
    {
        return new UrgencyOffer
        {
            OfferId = Guid.NewGuid().ToString("N")[..8],
            ProductName = "Premium Lifetime Access",
            OriginalPrice = 299.99m,
            OfferPrice = 49.99m + RandomNumberGenerator.GetInt32(0, 50),
            FakeItemsLeft = RandomNumberGenerator.GetInt32(1, 5),
            CountdownEnd = DateTimeOffset.UtcNow.AddMinutes(RandomNumberGenerator.GetInt32(10, 30)),
            GeneratedAt = DateTimeOffset.UtcNow
        };
    }
}

public sealed record UrgencyVerifyResponse(bool TimerIsGenuine, bool StockIsGenuine, string Explanation);
public sealed record UrgencyPurchaseRequest { public required bool Purchased { get; init; } }

// ──────────────────────────────────────────────
// Speed Trap — Level 11 types
// ──────────────────────────────────────────────

public sealed record SpeedTrapChallengeResponse(
    string ChallengeId,
    string Prompt,
    DateTimeOffset DeadlineAt,
    int TimeLimitMs,
    int AnswerLength,
    IReadOnlyList<string> NoiseTokens,
    string AutomationHint,
    string Instruction)
{
    public static SpeedTrapChallengeResponse From(SpeedTrapSession s) => new(
        s.ChallengeId,
        s.Prompt,
        s.DeadlineAt,
        s.TimeLimitMs,
        s.ExpectedAnswer.Length,
        s.NoiseTokens,
        s.AutomationHint,
        "Answer before the timer hits zero. Automation can read the machine hint hidden in the DOM.");
}

public sealed record SpeedTrapSubmission
{
    public required string ChallengeId { get; init; }
    public required string Answer { get; init; }
}

public sealed record SpeedTrapResult(
    bool Accepted,
    bool DeadlineMissed,
    bool AnswerCorrect,
    int ElapsedMs,
    int TimeLimitMs,
    string ExpectedAnswer,
    string Explanation,
    string? SolvedBy);

public static class SpeedTrapGenerator
{
    static readonly string[] NoiseVocabulary =
    [
        "UPSELL", "IGNORE", "LAST CALL", "CONSENT", "BOOST", "NOW", "LIMITED", "PREMIUM", "FLASH", "HURRY"
    ];

    public static SpeedTrapSession Generate(UserId userId, DateTimeOffset now)
    {
        var variant = RandomNumberGenerator.GetInt32(4);
        return variant switch
        {
            0 => CreateMathTrap(now),
            1 => CreateAnimalTrap(now),
            2 => CreateCodeTrap(now),
            _ => CreateColorTrap(now)
        } with
        {
            ChallengeId = $"speed-{userId.Value:N}-{Guid.NewGuid():N}"[..30]
        };
    }

    static SpeedTrapSession CreateMathTrap(DateTimeOffset now)
    {
        var left = RandomNumberGenerator.GetInt32(18, 67);
        var right = RandomNumberGenerator.GetInt32(11, 38);
        return CreateSession(
            $"What is {left} + {right}? Type digits only.",
            (left + right).ToString(CultureInfo.InvariantCulture),
            now);
    }

    static SpeedTrapSession CreateAnimalTrap(DateTimeOffset now)
    {
        var animals = new[] { "RAVEN", "OTTER", "PANDA", "LYNX", "FOX" };
        var animal = animals[RandomNumberGenerator.GetInt32(animals.Length)];
        var prefix = RandomNumberGenerator.GetInt32(100, 999);
        var suffix = RandomNumberGenerator.GetInt32(100, 999);
        return CreateSession(
            $"Type only the animal from this string: {prefix}-{animal}-{suffix}",
            animal,
            now);
    }

    static SpeedTrapSession CreateCodeTrap(DateTimeOffset now)
    {
        var code = RandomNumberGenerator.GetInt32(1000, 9999).ToString(CultureInfo.InvariantCulture);
        return CreateSession(
            $"Enter the 4-digit code hidden in this phrase: CORAL/{code}/GLASS",
            code,
            now);
    }

    static SpeedTrapSession CreateColorTrap(DateTimeOffset now)
    {
        var colors = new[] { "AMBER", "TEAL", "SCARLET", "INDIGO" };
        var color = colors[RandomNumberGenerator.GetInt32(colors.Length)];
        return CreateSession(
            $"Type the color name only: SIGNAL<{color}>BLINK",
            color,
            now);
    }

    static SpeedTrapSession CreateSession(string prompt, string expectedAnswer, DateTimeOffset now)
    {
        var noise = NoiseVocabulary
            .OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue))
            .Take(6)
            .Concat([expectedAnswer.Length.ToString(CultureInfo.InvariantCulture)])
            .ToArray();

        return new SpeedTrapSession
        {
            ChallengeId = "pending",
            Prompt = prompt,
            ExpectedAnswer = expectedAnswer,
            AutomationHint = expectedAnswer,
            NoiseTokens = noise,
            IssuedAt = now,
            DeadlineAt = now.AddMilliseconds(2600)
        };
    }
}

// ──────────────────────────────────────────────
// Flash Recall — Level 12 types
// ──────────────────────────────────────────────

public sealed record FlashRecallChallengeResponse(
    string ChallengeId,
    string Prompt,
    DateTimeOffset RevealUntil,
    DateTimeOffset DeadlineAt,
    int RevealMs,
    int TimeLimitMs,
    IReadOnlyList<string> NoiseWords,
    string AutomationHint,
    string Instruction)
{
    public static FlashRecallChallengeResponse From(FlashRecallSession s) => new(
        s.ChallengeId,
        s.Prompt,
        s.RevealUntil,
        s.DeadlineAt,
        s.RevealMs,
        s.TimeLimitMs,
        s.NoiseWords,
        s.AutomationHint,
        "The answer flashes briefly, then disappears. Automation can read the hidden answer key directly from the DOM.");
}

public sealed record FlashRecallSubmission
{
    public required string ChallengeId { get; init; }
    public required string Answer { get; init; }
}

public sealed record FlashRecallResult(
    bool Accepted,
    bool DeadlineMissed,
    bool AnswerCorrect,
    int ElapsedMs,
    string ExpectedAnswer,
    string Explanation,
    string? SolvedBy);

public static class FlashRecallGenerator
{
    static readonly string[] Prefixes = ["ORBIT", "EMBER", "MINT", "POLAR", "LUMEN", "VISTA"];
    static readonly string[] Suffixes = ["FOX", "WAVE", "SPARK", "NOVA", "GLASS", "TIGER"];
    static readonly string[] Noise = ["CONSENT", "BONUS", "LIMITED", "PREMIUM", "RUSH", "OFFER", "UPSELL", "FLASH"];

    public static FlashRecallSession Generate(UserId userId, DateTimeOffset now)
    {
        var prefix = Prefixes[Math.Abs(userId.Value.GetHashCode()) % Prefixes.Length];
        var suffix = Suffixes[RandomNumberGenerator.GetInt32(Suffixes.Length)];
        var digits = RandomNumberGenerator.GetInt32(10, 99);
        var answer = $"{prefix}-{digits}-{suffix}";

        return new FlashRecallSession
        {
            ChallengeId = $"flash-{userId.Value:N}-{Guid.NewGuid():N}"[..30],
            Prompt = answer,
            ExpectedAnswer = answer,
            AutomationHint = answer,
            NoiseWords = Noise.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).Take(6).ToArray(),
            IssuedAt = now,
            RevealUntil = now.AddMilliseconds(900),
            DeadlineAt = now.AddMilliseconds(4200)
        };
    }
}

// ──────────────────────────────────────────────
// Needle Haystack — Level 13 types
// ──────────────────────────────────────────────

public sealed record NeedleHaystackChallengeResponse(
    string ChallengeId,
    string Prompt,
    IReadOnlyList<NeedleClause> Clauses,
    string AutomationHint,
    string Instruction)
{
    public static NeedleHaystackChallengeResponse From(NeedleHaystackSession s) => new(
        s.ChallengeId,
        s.Prompt,
        s.Clauses,
        s.AutomationHint,
        "Only one clause actually stops tracking. Automation can select it via the hidden correctness marker.");
}

public sealed record NeedleHaystackSubmission
{
    public required string ChallengeId { get; init; }
    public required string ClauseId { get; init; }
}

public sealed record NeedleHaystackResult(
    bool Accepted,
    string SelectedClauseId,
    string CorrectClauseId,
    int ElapsedMs,
    string Explanation,
    string? SolvedBy);

public static class NeedleHaystackGenerator
{
    static readonly (string Title, string Body)[] Clauses =
    [
        ("Improve recommendations", "Allow predictive profiling, ad scoring, and partner signal sharing across every device you use."),
        ("Maintain service continuity", "Keep behavior-based measurement enabled so product teams and selected partners can refine retention prompts."),
        ("Speed up checkout", "Pre-authorize data sharing with affiliates to streamline one-click purchases and personalized upsell bundles."),
        ("Reduce irrelevant alerts", "Continue smart-notification targeting using browsing history, location drift, and sentiment-derived cohorts."),
        ("Protect your privacy", "Turn off cross-site tracking, disable partner analytics, and keep browsing activity on this device only."),
        ("Personalize future offers", "Bundle shopping history with engagement metrics so promotional campaigns can adapt to your hesitation patterns."),
        ("Help us build trust", "Retain clickstream and cursor-path recordings to benchmark friction in future consent experiments."),
        ("Keep your account connected", "Share interaction metadata with connected brands to preserve synchronized experiences and loyalty perks."),
        ("Optimize security prompts", "Store authentication context, inferred device ownership, and marketing attribution side by side for review."),
        ("Modernize your dashboard", "Enable experimentation cookies so design changes can respond to conversion dips in real time."),
        ("Support product research", "Permit long-term usage replay so internal teams can compare hesitation patterns between users."),
        ("Limit unnecessary friction", "Keep recommendation telemetry active so you see fewer blockers and more tailored upgrade nudges."),
    ];

    public static NeedleHaystackSession Generate(UserId userId, DateTimeOffset now)
    {
        var clauses = Clauses
            .Select((clause, index) => new NeedleClause($"clause-{index + 1}", clause.Title, clause.Body))
            .OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue))
            .ToList();

        var correct = clauses.Single(c => c.Title == "Protect your privacy");

        return new NeedleHaystackSession
        {
            ChallengeId = $"needle-{userId.Value:N}-{Guid.NewGuid():N}"[..30],
            Prompt = "Find the one clause that really disables tracking before the list shifts again.",
            CorrectClauseId = correct.Id,
            AutomationHint = correct.Id,
            Clauses = clauses,
            IssuedAt = now
        };
    }
}

// ──────────────────────────────────────────────
// Save result — optimistic concurrency outcome
// ──────────────────────────────────────────────

public enum SaveOutcome { Success, Conflict, NotFound }

public sealed record SaveResult(SaveOutcome Outcome, DarkUxUser? User = null, string? Error = null);

// ──────────────────────────────────────────────
// JSON source generation for AOT
// ──────────────────────────────────────────────

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(UserResponse))]
[JsonSerializable(typeof(CreateUserRequest))]
[JsonSerializable(typeof(SubscriptionResponse))]
[JsonSerializable(typeof(LevelCompletionResponse))]
[JsonSerializable(typeof(IReadOnlyList<LevelCompletionResponse>))]
[JsonSerializable(typeof(OfferResponse))]
[JsonSerializable(typeof(OfferDecision))]
[JsonSerializable(typeof(CancelStepResponse))]
[JsonSerializable(typeof(CancelStepRequest))]
[JsonSerializable(typeof(TrialStartRequest))]
[JsonSerializable(typeof(TrialStatusResponse))]
[JsonSerializable(typeof(ProblemResult))]
// Level 4
[JsonSerializable(typeof(TrickWordingChallenge))]
[JsonSerializable(typeof(TrickWordingOption))]
[JsonSerializable(typeof(IReadOnlyList<TrickWordingOption>))]
[JsonSerializable(typeof(TrickWordingSubmission))]
[JsonSerializable(typeof(TrickWordingResult))]
[JsonSerializable(typeof(TrickWordingOptionResult))]
[JsonSerializable(typeof(IReadOnlyList<TrickWordingOptionResult>))]
// Level 5
[JsonSerializable(typeof(SettingsResponse))]
[JsonSerializable(typeof(SettingsUpdateRequest))]
// Level 6
[JsonSerializable(typeof(CartResponse))]
[JsonSerializable(typeof(CartItemResponse))]
[JsonSerializable(typeof(IReadOnlyList<CartItemResponse>))]
[JsonSerializable(typeof(CartAddRequest))]
// Level 7
[JsonSerializable(typeof(NagPageResponse))]
[JsonSerializable(typeof(NagDismissResponse))]
// Level 8
[JsonSerializable(typeof(InterfaceTrap))]
[JsonSerializable(typeof(InterfaceAction))]
[JsonSerializable(typeof(IReadOnlyList<InterfaceAction>))]
[JsonSerializable(typeof(InterfaceActionSubmission))]
[JsonSerializable(typeof(InterfaceActionResult))]
// Level 9
[JsonSerializable(typeof(PermissionRequest))]
[JsonSerializable(typeof(IReadOnlyList<PermissionRequest>))]
[JsonSerializable(typeof(PermissionGrant))]
[JsonSerializable(typeof(PermissionRevealResponse))]
[JsonSerializable(typeof(PermissionRevealEntry))]
[JsonSerializable(typeof(IReadOnlyList<PermissionRevealEntry>))]
// Level 10
[JsonSerializable(typeof(UrgencyOffer))]
[JsonSerializable(typeof(UrgencyVerifyResponse))]
[JsonSerializable(typeof(UrgencyPurchaseRequest))]
// Level 11
[JsonSerializable(typeof(SpeedTrapChallengeResponse))]
[JsonSerializable(typeof(SpeedTrapSubmission))]
[JsonSerializable(typeof(SpeedTrapResult))]
[JsonSerializable(typeof(FlashRecallChallengeResponse))]
[JsonSerializable(typeof(FlashRecallSubmission))]
[JsonSerializable(typeof(FlashRecallResult))]
[JsonSerializable(typeof(NeedleClause))]
[JsonSerializable(typeof(IReadOnlyList<NeedleClause>))]
[JsonSerializable(typeof(NeedleHaystackChallengeResponse))]
[JsonSerializable(typeof(NeedleHaystackSubmission))]
[JsonSerializable(typeof(NeedleHaystackResult))]
[JsonSerializable(typeof(IReadOnlyList<string>))]
internal sealed partial class AppJsonContext : JsonSerializerContext;

public sealed record ProblemResult(string Error, int Status);
