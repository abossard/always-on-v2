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
        var r = await http.PostAsJsonAsync(new Uri(Routes.Users, UriKind.Relative), new { displayName });
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<UserResponse>(Json))!;
    }

    public async Task<UserResponse?> GetUser(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.User(userId), UriKind.Relative));
        if (r.StatusCode == HttpStatusCode.NotFound) return null;
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<List<LevelCompletionResponse>?> GetProgress(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.UserProgress(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<List<LevelCompletionResponse>>(Json);
    }

    // ── Level 1: Confirmshaming ──────────────────

    public async Task<OfferResponse?> GetOffer(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level1Offer(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<OfferResponse>(Json);
    }

    public async Task<UserResponse?> RespondToOffer(string userId, bool accepted)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level1Respond(userId), UriKind.Relative), new { accepted });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 2: Roach Motel ─────────────────────

    public async Task<UserResponse?> Subscribe(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.Subscribe(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<CancelStepResponse?> GetCancelStep(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.CancelStep(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
    }

    public async Task<CancelStepResponse?> SubmitCancelStep(string userId, string selectedOption)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.CancelStep(userId), UriKind.Relative), new { selectedOption });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CancelStepResponse>(Json);
    }

    public async Task<UserResponse?> ConfirmCancel(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.CancelConfirm(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 3: Forced Continuity ───────────────

    public async Task<UserResponse?> StartTrial(string userId, int durationDays = 7)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.TrialStart(userId), UriKind.Relative), new { durationDays });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    public async Task<TrialStatusResponse?> GetTrialStatus(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.TrialStatus(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrialStatusResponse>(Json);
    }

    public async Task<UserResponse?> CancelTrial(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.TrialCancel(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UserResponse>(Json);
    }

    // ── Level 4: Trick Wording ───────────────────

    public async Task<TrickWordingChallenge?> GetTrickWordingChallenge(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level4Challenge(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrickWordingChallenge>(Json);
    }

    public async Task<TrickWordingResult?> SubmitTrickWording(string userId, string[] selectedOptionIds)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level4Submit(userId), UriKind.Relative), new { selectedOptionIds });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<TrickWordingResult>(Json);
    }

    // ── Level 5: Preselection ────────────────────

    public async Task<SettingsResponse?> GetSettings(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level5Settings(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);
    }

    public async Task<SettingsResponse?> UpdateSettings(string userId,
        bool newsletterOptIn, bool shareDataWithPartners,
        bool locationTracking, bool pushNotifications)
    {
        var body = new { newsletterOptIn, shareDataWithPartners, locationTracking, pushNotifications };
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level5Settings(userId), UriKind.Relative), body);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SettingsResponse>(Json);
    }

    // ── Level 6: Basket Sneaking ─────────────────

    public async Task<CartResponse?> GetCart(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level6Cart(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> AddToCart(string userId, string itemId, string name, decimal price)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level6CartAdd(userId), UriKind.Relative), new { itemId, name, price });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> Checkout(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.Level6CartCheckout(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    public async Task<CartResponse?> RemoveFromCart(string userId, string itemId)
    {
        var r = await http.PostAsync(new Uri(Routes.Level6CartRemove(userId, itemId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<CartResponse>(Json);
    }

    // ── Level 7: Nagging ─────────────────────────

    public async Task<NagPageResponse?> GetNagPage(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level7Page(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagPageResponse>(Json);
    }

    public async Task<NagDismissResponse?> DismissNag(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.Level7Dismiss(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagDismissResponse>(Json);
    }

    public async Task<NagDismissResponse?> DismissNagPermanently(string userId)
    {
        var r = await http.PostAsync(new Uri(Routes.Level7DismissPermanently(userId), UriKind.Relative), null);
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NagDismissResponse>(Json);
    }

    // ── Level 8: Interface Interference ──────────

    public async Task<InterfaceTrap?> GetInterfacePage(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level8Page(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<InterfaceTrap>(Json);
    }

    public async Task<InterfaceActionResult?> SubmitInterfaceAction(string userId, string actionId)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level8Action(userId), UriKind.Relative), new { actionId });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<InterfaceActionResult>(Json);
    }

    // ── Level 9: Zuckering ───────────────────────

    public async Task<List<PermissionRequest>?> GetPermissions(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level9Permissions(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<List<PermissionRequest>>(Json);
    }

    public async Task<PermissionRevealResponse?> GrantPermissions(string userId, string[] grantedPermissionIds)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level9Permissions(userId), UriKind.Relative), new { grantedPermissionIds });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<PermissionRevealResponse>(Json);
    }

    // ── Level 10: Emotional Manipulation ─────────

    public async Task<UrgencyOffer?> GetUrgencyOffer(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level10Offer(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UrgencyOffer>(Json);
    }

    public async Task<UrgencyVerifyResponse?> VerifyUrgency(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level10Verify(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<UrgencyVerifyResponse>(Json);
    }

    // ── Level 11: Speed Trap ─────────────────────

    public async Task<SpeedTrapChallengeResponse?> GetSpeedTrapChallenge(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level11Challenge(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SpeedTrapChallengeResponse>(Json);
    }

    public async Task<SpeedTrapResult?> SubmitSpeedTrap(string userId, string challengeId, string answer)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level11Submit(userId), UriKind.Relative), new { challengeId, answer });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<SpeedTrapResult>(Json);
    }

    // ── Level 12: Flash Recall ───────────────────

    public async Task<FlashRecallChallengeResponse?> GetFlashRecallChallenge(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level12Challenge(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<FlashRecallChallengeResponse>(Json);
    }

    public async Task<FlashRecallResult?> SubmitFlashRecall(string userId, string challengeId, string answer)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level12Submit(userId), UriKind.Relative), new { challengeId, answer });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<FlashRecallResult>(Json);
    }

    // ── Level 13: Needle Haystack ────────────────

    public async Task<NeedleHaystackChallengeResponse?> GetNeedleHaystackChallenge(string userId)
    {
        var r = await http.GetAsync(new Uri(Routes.Level13Challenge(userId), UriKind.Relative));
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NeedleHaystackChallengeResponse>(Json);
    }

    public async Task<NeedleHaystackResult?> SubmitNeedleHaystack(string userId, string challengeId, string clauseId)
    {
        var r = await http.PostAsJsonAsync(new Uri(Routes.Level13Submit(userId), UriKind.Relative), new { challengeId, clauseId });
        r.EnsureSuccessStatusCode();
        return await r.Content.ReadFromJsonAsync<NeedleHaystackResult>(Json);
    }
}
