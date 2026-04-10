// ApiClient.cs — Typed HTTP client for DarkUxChallenge API.
// Mirrors Routes.cs helpers. Tests use this instead of raw HttpClient + hardcoded paths.

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkUxChallenge.Api;

namespace DarkUxChallenge.Tests;

public class DarkUxApi(HttpClient http)
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Raw HttpClient for status-code assertions (404, 400, etc.).</summary>
    public HttpClient Http => http;

    // ── User Management ──────────────────────────

    public async Task<UserResponse> CreateUser(string? displayName = null)
    {
        var r = await http.PostAsJsonAsync(Routes.Users, new { displayName });
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<UserResponse>(Json))!;
    }

    public async Task<UserResponse?> GetUser(string userId)
    {
        var r = await http.GetAsync(Routes.User(userId));
        if (r.StatusCode == HttpStatusCode.NotFound) return null;
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<List<LevelCompletionResponse>?> GetProgress(string userId)
    {
        var r = await http.GetAsync(Routes.UserProgress(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<List<LevelCompletionResponse>>(Json);
    }

    // ── Level 1: Confirmshaming ──────────────────

    public async Task<OfferResponse?> GetOffer(string userId)
    {
        var r = await http.GetAsync(Routes.Level1Offer(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<OfferResponse>(Json);
    }

    public async Task<UserResponse?> RespondToOffer(string userId, bool accepted)
    {
        var r = await http.PostAsJsonAsync(Routes.Level1Respond(userId), new { accepted });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 2: Roach Motel ─────────────────────

    public async Task<UserResponse?> Subscribe(string userId)
    {
        var r = await http.PostAsync(Routes.Subscribe(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<CancelStepResponse?> GetCancelStep(string userId)
    {
        var r = await http.GetAsync(Routes.CancelStep(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
    }

    public async Task<CancelStepResponse?> SubmitCancelStep(string userId, string selectedOption)
    {
        var r = await http.PostAsJsonAsync(Routes.CancelStep(userId), new { selectedOption });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
    }

    public async Task<UserResponse?> ConfirmCancel(string userId)
    {
        var r = await http.PostAsync(Routes.CancelConfirm(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 3: Forced Continuity ───────────────

    public async Task<UserResponse?> StartTrial(string userId, int durationDays = 7)
    {
        var r = await http.PostAsJsonAsync(Routes.TrialStart(userId), new { durationDays });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<TrialStatusResponse?> GetTrialStatus(string userId)
    {
        var r = await http.GetAsync(Routes.TrialStatus(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrialStatusResponse>(Json);
    }

    public async Task<UserResponse?> CancelTrial(string userId)
    {
        var r = await http.PostAsync(Routes.TrialCancel(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 4: Trick Wording ───────────────────

    public async Task<TrickWordingChallenge?> GetTrickWordingChallenge(string userId)
    {
        var r = await http.GetAsync(Routes.Level4Challenge(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrickWordingChallenge>(Json);
    }

    public async Task<TrickWordingResult?> SubmitTrickWording(string userId, string[] selectedOptionIds)
    {
        var r = await http.PostAsJsonAsync(Routes.Level4Submit(userId), new { selectedOptionIds });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrickWordingResult>(Json);
    }

    // ── Level 5: Preselection ────────────────────

    public async Task<SettingsResponse?> GetSettings(string userId)
    {
        var r = await http.GetAsync(Routes.Level5Settings(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);
    }

    public async Task<SettingsResponse?> UpdateSettings(string userId,
        bool newsletterOptIn, bool shareDataWithPartners,
        bool locationTracking, bool pushNotifications)
    {
        var body = new { newsletterOptIn, shareDataWithPartners, locationTracking, pushNotifications };
        var r = await http.PostAsJsonAsync(Routes.Level5Settings(userId), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);
    }

    // ── Level 6: Basket Sneaking ─────────────────

    public async Task<CartResponse?> GetCart(string userId)
    {
        var r = await http.GetAsync(Routes.Level6Cart(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> AddToCart(string userId, string itemId, string name, decimal price)
    {
        var r = await http.PostAsJsonAsync(Routes.Level6CartAdd(userId), new { itemId, name, price });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> Checkout(string userId)
    {
        var r = await http.PostAsync(Routes.Level6CartCheckout(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> RemoveFromCart(string userId, string itemId)
    {
        var r = await http.PostAsync(Routes.Level6CartRemove(userId, itemId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    // ── Level 7: Nagging ─────────────────────────

    public async Task<NagPageResponse?> GetNagPage(string userId)
    {
        var r = await http.GetAsync(Routes.Level7Page(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagPageResponse>(Json);
    }

    public async Task<NagDismissResponse?> DismissNag(string userId)
    {
        var r = await http.PostAsync(Routes.Level7Dismiss(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagDismissResponse>(Json);
    }

    public async Task<NagDismissResponse?> DismissNagPermanently(string userId)
    {
        var r = await http.PostAsync(Routes.Level7DismissPermanently(userId), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagDismissResponse>(Json);
    }

    // ── Level 8: Interface Interference ──────────

    public async Task<InterfaceTrap?> GetInterfacePage(string userId)
    {
        var r = await http.GetAsync(Routes.Level8Page(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<InterfaceTrap>(Json);
    }

    public async Task<InterfaceActionResult?> SubmitInterfaceAction(string userId, string actionId)
    {
        var r = await http.PostAsJsonAsync(Routes.Level8Action(userId), new { actionId });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<InterfaceActionResult>(Json);
    }

    // ── Level 9: Zuckering ───────────────────────

    public async Task<List<PermissionRequest>?> GetPermissions(string userId)
    {
        var r = await http.GetAsync(Routes.Level9Permissions(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<List<PermissionRequest>>(Json);
    }

    public async Task<PermissionRevealResponse?> GrantPermissions(string userId, string[] grantedPermissionIds)
    {
        var r = await http.PostAsJsonAsync(Routes.Level9Permissions(userId), new { grantedPermissionIds });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<PermissionRevealResponse>(Json);
    }

    // ── Level 10: Emotional Manipulation ─────────

    public async Task<UrgencyOffer?> GetUrgencyOffer(string userId)
    {
        var r = await http.GetAsync(Routes.Level10Offer(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UrgencyOffer>(Json);
    }

    public async Task<UrgencyVerifyResponse?> VerifyUrgency(string userId)
    {
        var r = await http.GetAsync(Routes.Level10Verify(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UrgencyVerifyResponse>(Json);
    }

    // ── Level 11: Speed Trap ─────────────────────

    public async Task<SpeedTrapChallengeResponse?> GetSpeedTrapChallenge(string userId)
    {
        var r = await http.GetAsync(Routes.Level11Challenge(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SpeedTrapChallengeResponse>(Json);
    }

    public async Task<SpeedTrapResult?> SubmitSpeedTrap(string userId, string challengeId, string answer)
    {
        var r = await http.PostAsJsonAsync(Routes.Level11Submit(userId), new { challengeId, answer });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SpeedTrapResult>(Json);
    }

    // ── Level 12: Flash Recall ───────────────────

    public async Task<FlashRecallChallengeResponse?> GetFlashRecallChallenge(string userId)
    {
        var r = await http.GetAsync(Routes.Level12Challenge(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<FlashRecallChallengeResponse>(Json);
    }

    public async Task<FlashRecallResult?> SubmitFlashRecall(string userId, string challengeId, string answer)
    {
        var r = await http.PostAsJsonAsync(Routes.Level12Submit(userId), new { challengeId, answer });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<FlashRecallResult>(Json);
    }

    // ── Level 13: Needle Haystack ────────────────

    public async Task<NeedleHaystackChallengeResponse?> GetNeedleHaystackChallenge(string userId)
    {
        var r = await http.GetAsync(Routes.Level13Challenge(userId));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NeedleHaystackChallengeResponse>(Json);
    }

    public async Task<NeedleHaystackResult?> SubmitNeedleHaystack(string userId, string challengeId, string clauseId)
    {
        var r = await http.PostAsJsonAsync(Routes.Level13Submit(userId), new { challengeId, clauseId });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NeedleHaystackResult>(Json);
    }
}
