// Routes.cs — Single source of truth for all HTTP route paths.
// Template constants are used by Endpoints.cs. Helper methods are used by tests/clients.

namespace DarkUxChallenge.Api;

public static class Routes
{
    public const string BasePath = "/api";

    // ── User Management ──────────────────────────
    public const string Users = "/api/users";
    public const string UserTemplate = "/api/users/{userId}";
    public const string UserProgressTemplate = "/api/users/{userId}/progress";

    // ── Level 1: Confirmshaming ──────────────────
    public const string Level1OfferTemplate = "/api/levels/1/offer/{userId}";
    public const string Level1RespondTemplate = "/api/levels/1/respond/{userId}";

    // ── Level 2: Roach Motel ─────────────────────
    public const string SubscribeTemplate = "/api/users/{userId}/subscribe";
    public const string CancelStepTemplate = "/api/users/{userId}/cancel/step";
    public const string CancelConfirmTemplate = "/api/users/{userId}/cancel/confirm";

    // ── Level 3: Forced Continuity ───────────────
    public const string TrialStartTemplate = "/api/users/{userId}/trial/start";
    public const string TrialStatusTemplate = "/api/users/{userId}/trial/status";
    public const string TrialCancelTemplate = "/api/users/{userId}/trial/cancel";

    // ── Level 4: Trick Wording ───────────────────
    public const string Level4ChallengeTemplate = "/api/levels/4/challenge/{userId}";
    public const string Level4SubmitTemplate = "/api/levels/4/submit/{userId}";

    // ── Level 5: Preselection ────────────────────
    public const string Level5SettingsTemplate = "/api/levels/5/settings/{userId}";

    // ── Level 6: Basket Sneaking ─────────────────
    public const string Level6CartTemplate = "/api/levels/6/cart/{userId}";
    public const string Level6CartAddTemplate = "/api/levels/6/cart/{userId}/add";
    public const string Level6CartCheckoutTemplate = "/api/levels/6/cart/{userId}/checkout";
    public const string Level6CartRemoveTemplate = "/api/levels/6/cart/{userId}/remove/{itemId}";

    // ── Level 7: Nagging ─────────────────────────
    public const string Level7PageTemplate = "/api/levels/7/page/{userId}";
    public const string Level7DismissTemplate = "/api/levels/7/dismiss/{userId}";
    public const string Level7DismissPermanentlyTemplate = "/api/levels/7/dismiss-permanently/{userId}";

    // ── Level 8: Interface Interference ──────────
    public const string Level8PageTemplate = "/api/levels/8/page/{userId}";
    public const string Level8ActionTemplate = "/api/levels/8/action/{userId}";

    // ── Level 9: Zuckering ───────────────────────
    public const string Level9PermissionsTemplate = "/api/levels/9/permissions/{userId}";

    // ── Level 10: Emotional Manipulation ─────────
    public const string Level10OfferTemplate = "/api/levels/10/offer/{userId}";
    public const string Level10VerifyTemplate = "/api/levels/10/offer/{userId}/verify";
    public const string Level10PurchaseTemplate = "/api/levels/10/offer/{userId}/purchase";

    // ── Level 11: Speed Trap ─────────────────────
    public const string Level11ChallengeTemplate = "/api/levels/11/challenge/{userId}";
    public const string Level11SubmitTemplate = "/api/levels/11/submit/{userId}";

    // ── Level 12: Flash Recall ───────────────────
    public const string Level12ChallengeTemplate = "/api/levels/12/challenge/{userId}";
    public const string Level12SubmitTemplate = "/api/levels/12/submit/{userId}";

    // ── Level 13: Needle Haystack ────────────────
    public const string Level13ChallengeTemplate = "/api/levels/13/challenge/{userId}";
    public const string Level13SubmitTemplate = "/api/levels/13/submit/{userId}";

    // ── Helper methods (substitute path parameters) ──

    public static string User(string userId) => UserTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string UserProgress(string userId) => UserProgressTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level1Offer(string userId) => Level1OfferTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level1Respond(string userId) => Level1RespondTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Subscribe(string userId) => SubscribeTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string CancelStep(string userId) => CancelStepTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string CancelConfirm(string userId) => CancelConfirmTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string TrialStart(string userId) => TrialStartTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string TrialStatus(string userId) => TrialStatusTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string TrialCancel(string userId) => TrialCancelTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level4Challenge(string userId) => Level4ChallengeTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level4Submit(string userId) => Level4SubmitTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level5Settings(string userId) => Level5SettingsTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level6Cart(string userId) => Level6CartTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level6CartAdd(string userId) => Level6CartAddTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level6CartCheckout(string userId) => Level6CartCheckoutTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level6CartRemove(string userId, string itemId) =>
        Level6CartRemoveTemplate.Replace("{userId}", userId, StringComparison.Ordinal).Replace("{itemId}", itemId, StringComparison.Ordinal);

    public static string Level7Page(string userId) => Level7PageTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level7Dismiss(string userId) => Level7DismissTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level7DismissPermanently(string userId) => Level7DismissPermanentlyTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level8Page(string userId) => Level8PageTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level8Action(string userId) => Level8ActionTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level9Permissions(string userId) => Level9PermissionsTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level10Offer(string userId) => Level10OfferTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level10Verify(string userId) => Level10VerifyTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level10Purchase(string userId) => Level10PurchaseTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level11Challenge(string userId) => Level11ChallengeTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level11Submit(string userId) => Level11SubmitTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level12Challenge(string userId) => Level12ChallengeTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level12Submit(string userId) => Level12SubmitTemplate.Replace("{userId}", userId, StringComparison.Ordinal);

    public static string Level13Challenge(string userId) => Level13ChallengeTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
    public static string Level13Submit(string userId) => Level13SubmitTemplate.Replace("{userId}", userId, StringComparison.Ordinal);
}
