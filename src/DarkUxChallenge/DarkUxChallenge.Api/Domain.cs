// Domain.cs — Core types, validation, and business rules.
// No infrastructure dependencies. Pure data + calculations.

using System.Diagnostics.CodeAnalysis;
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
    string[] Options,
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
internal partial class AppJsonContext : JsonSerializerContext;

public sealed record ProblemResult(string Error, int Status);
