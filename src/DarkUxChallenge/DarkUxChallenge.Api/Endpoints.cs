// Endpoints.cs — Driving adapter. HTTP routes → domain logic → storage.

namespace DarkUxChallenge.Api;

public static class Endpoints
{
    public const string BasePath = "/api";

    public static WebApplication MapDarkUxEndpoints(this WebApplication app)
    {
        // User management (hub)
        var users = app.MapGroup($"{BasePath}/users");
        users.MapPost("/", CreateUser);
        users.MapPut("/{userId}", CreateOrGetUser);
        users.MapGet("/{userId}", GetUser);
        users.MapGet("/{userId}/progress", GetProgress);

        // Level 1: Confirmshaming
        var level1 = app.MapGroup($"{BasePath}/levels/1");
        level1.MapGet("/offer/{userId}", GetConfirmshamingOffer);
        level1.MapPost("/respond/{userId}", RespondToOffer);

        // Level 2: Roach Motel
        var level2 = app.MapGroup($"{BasePath}/users/{{userId}}");
        level2.MapPost("/subscribe", Subscribe);
        level2.MapGet("/cancel/step", GetCancelStep);
        level2.MapPost("/cancel/step", SubmitCancelStep);
        level2.MapPost("/cancel/confirm", ConfirmCancel);

        // Level 3: Forced Continuity
        var level3 = app.MapGroup($"{BasePath}/users/{{userId}}/trial");
        level3.MapPost("/start", StartTrial);
        level3.MapGet("/status", GetTrialStatus);
        level3.MapPost("/cancel", CancelTrial);

        // Level 4: Trick Wording
        var level4 = app.MapGroup($"{BasePath}/levels/4");
        level4.MapGet("/challenge/{userId}", GetTrickWordingChallenge);
        level4.MapPost("/submit/{userId}", SubmitTrickWording);

        // Level 5: Preselection
        var level5 = app.MapGroup($"{BasePath}/levels/5");
        level5.MapGet("/settings/{userId}", GetSettings);
        level5.MapPost("/settings/{userId}", UpdateSettings);

        // Level 6: Basket Sneaking
        var level6 = app.MapGroup($"{BasePath}/levels/6/cart");
        level6.MapGet("/{userId}", GetCart);
        level6.MapPost("/{userId}/add", AddToCart);
        level6.MapPost("/{userId}/checkout", Checkout);
        level6.MapPost("/{userId}/remove/{itemId}", RemoveFromCart);

        // Level 7: Nagging
        var level7 = app.MapGroup($"{BasePath}/levels/7");
        level7.MapGet("/page/{userId}", GetNagPage);
        level7.MapPost("/dismiss/{userId}", DismissNag);
        level7.MapPost("/dismiss-permanently/{userId}", DismissNagPermanently);

        // Level 8: Interface Interference
        var level8 = app.MapGroup($"{BasePath}/levels/8");
        level8.MapGet("/page/{userId}", GetInterfacePage);
        level8.MapPost("/action/{userId}", SubmitInterfaceAction);

        // Level 9: Zuckering
        var level9 = app.MapGroup($"{BasePath}/levels/9");
        level9.MapGet("/permissions/{userId}", GetPermissions);
        level9.MapPost("/permissions/{userId}", GrantPermissions);

        // Level 10: Emotional Manipulation
        var level10 = app.MapGroup($"{BasePath}/levels/10");
        level10.MapGet("/offer/{userId}", GetUrgencyOffer);
        level10.MapGet("/offer/{userId}/verify", VerifyUrgency);
        level10.MapPost("/offer/{userId}/purchase", PurchaseUrgency);

        // Level 11: Speed Trap
        var level11 = app.MapGroup($"{BasePath}/levels/11");
        level11.MapGet("/challenge/{userId}", GetSpeedTrapChallenge);
        level11.MapPost("/submit/{userId}", SubmitSpeedTrap);

        // Level 12: Flash Recall
        var level12 = app.MapGroup($"{BasePath}/levels/12");
        level12.MapGet("/challenge/{userId}", GetFlashRecallChallenge);
        level12.MapPost("/submit/{userId}", SubmitFlashRecall);

        // Level 13: Needle Haystack
        var level13 = app.MapGroup($"{BasePath}/levels/13");
        level13.MapGet("/challenge/{userId}", GetNeedleHaystackChallenge);
        level13.MapPost("/submit/{userId}", SubmitNeedleHaystack);

        return app;
    }

    // ── User Management ─────────────────────────

    static async Task<IResult> CreateUser(
        CreateUserRequest request,
        IUserStore store,
        CancellationToken ct)
    {
        var userId = UserId.New();
        var user = new DarkUxUser
        {
            UserId = userId,
            DisplayName = request.DisplayName ?? "Anonymous"
        };

        var result = await store.SaveUser(user, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse, statusCode: 201)
            : Results.Json(new ProblemResult(result.Error ?? "Failed to create user.", 500), AppJsonContext.Default.ProblemResult, statusCode: 500);
    }

    static async Task<IResult> CreateOrGetUser(
        string userId,
        CreateUserRequest request,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        // Idempotent: return existing user or create new one
        var existing = await store.GetUser(id.Value, ct);
        if (existing is not null)
            return Results.Json(UserResponse.From(existing), AppJsonContext.Default.UserResponse);

        var user = new DarkUxUser
        {
            UserId = id.Value,
            DisplayName = request.DisplayName ?? "Anonymous"
        };

        var result = await store.SaveUser(user, ct);
        return result.Outcome switch
        {
            SaveOutcome.Success => Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse, statusCode: 201),
            SaveOutcome.Conflict => Results.Json(UserResponse.From((await store.GetUser(id.Value, ct))!), AppJsonContext.Default.UserResponse),
            _ => Results.Json(new ProblemResult(result.Error ?? "Failed", 500), AppJsonContext.Default.ProblemResult, statusCode: 500)
        };
    }

    static async Task<IResult> GetUser(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        return Results.Json(UserResponse.From(user), AppJsonContext.Default.UserResponse);
    }

    static async Task<IResult> GetProgress(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        return Results.Json(
            user.Completions.Select(c => new LevelCompletionResponse(c.Level, c.SolvedByHuman, c.SolvedByAutomation, c.CompletedAt)).ToList(),
            AppJsonContext.Default.IReadOnlyListLevelCompletionResponse);
    }

    // ── Level 1: Confirmshaming ─────────────────

    static async Task<IResult> GetConfirmshamingOffer(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var offer = ConfirmshamingGenerator.GetOffer(id.Value);
        return Results.Json(OfferResponse.From(offer), AppJsonContext.Default.OfferResponse);
    }

    static async Task<IResult> RespondToOffer(
        string userId,
        OfferDecision decision,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        // Record completion — declining despite guilt-trip = solved by human
        var updated = user.WithCompletion(1, byHuman: !decision.Accepted, byAutomation: false, DateTimeOffset.UtcNow);
        var result = await store.SaveUser(updated, ct);

        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    // ── Level 2: Roach Motel ────────────────────

    static async Task<IResult> Subscribe(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user with
        {
            Subscription = user.Subscription.Subscribe(SubscriptionTier.Premium),
            CancellationFlow = CancellationFlow.NotStarted,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    static async Task<IResult> GetCancelStep(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        // Start cancellation flow if not started
        if (user.CancellationFlow.CurrentStep == CancellationStep.NotStarted)
        {
            var started = user with
            {
                CancellationFlow = user.CancellationFlow.Start(DateTimeOffset.UtcNow),
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await store.SaveUser(started, ct);
            return Results.Json(CancelStepResponse.ForStep(CancellationStep.Survey), AppJsonContext.Default.CancelStepResponse);
        }

        return Results.Json(CancelStepResponse.ForStep(user.CancellationFlow.CurrentStep), AppJsonContext.Default.CancelStepResponse);
    }

    static async Task<IResult> SubmitCancelStep(
        string userId,
        CancelStepRequest request,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var flow = user.CancellationFlow;
        flow = flow.CurrentStep switch
        {
            CancellationStep.Survey => flow.SubmitSurvey(request.SelectedOption ?? "Other"),
            CancellationStep.DiscountOffer when request.SelectedOption == "Accept discount and stay"
                => flow.AcceptDiscount(),
            CancellationStep.DiscountOffer => flow.DeclineDiscount(),
            _ => flow
        };

        var updated = user with { CancellationFlow = flow, UpdatedAt = DateTimeOffset.UtcNow };

        // If discount accepted, cancel the cancellation flow
        if (flow.DiscountAccepted && flow.CurrentStep == CancellationStep.Completed)
        {
            updated = updated with { CancellationFlow = CancellationFlow.NotStarted };
        }

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(CancelStepResponse.ForStep(updated.CancellationFlow.CurrentStep), AppJsonContext.Default.CancelStepResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    static async Task<IResult> ConfirmCancel(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        if (user.CancellationFlow.CurrentStep != CancellationStep.FinalConfirm)
            return Results.Json(new ProblemResult("Cannot confirm cancellation at this step.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var updated = user with
        {
            Subscription = user.Subscription.Cancel(DateTimeOffset.UtcNow),
            CancellationFlow = user.CancellationFlow.Confirm(),
            UpdatedAt = DateTimeOffset.UtcNow
        };

        // Record level 2 completion — navigating the full gauntlet = solved
        updated = updated.WithCompletion(2, byHuman: true, byAutomation: false, DateTimeOffset.UtcNow);

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    // ── Level 3: Forced Continuity ──────────────

    static async Task<IResult> StartTrial(
        string userId,
        TrialStartRequest request,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var duration = TimeSpan.FromDays(Math.Clamp(request.DurationDays, 1, 30));
        var updated = user with
        {
            Subscription = user.Subscription.StartTrial(DateTimeOffset.UtcNow, duration),
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    static async Task<IResult> GetTrialStatus(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        // Dark pattern: silently check and convert trial
        var now = DateTimeOffset.UtcNow;
        var newSub = user.Subscription.CheckTrialExpiry(now);
        var wasConverted = user.Subscription.Tier == SubscriptionTier.FreeTrial && newSub.Tier == SubscriptionTier.Basic;

        if (wasConverted)
        {
            var updated = user with { Subscription = newSub, UpdatedAt = now };
            await store.SaveUser(updated, ct);
        }

        return Results.Json(TrialStatusResponse.From(newSub, wasConverted), AppJsonContext.Default.TrialStatusResponse);
    }

    static async Task<IResult> CancelTrial(
        string userId,
        IUserStore store,
        CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID format. Expected GUID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user with
        {
            Subscription = user.Subscription.Cancel(DateTimeOffset.UtcNow),
            UpdatedAt = DateTimeOffset.UtcNow
        };

        // Record level 3 completion — cancelling before silent conversion = solved
        updated = updated.WithCompletion(3, byHuman: true, byAutomation: false, DateTimeOffset.UtcNow);

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(UserResponse.From(result.User!), AppJsonContext.Default.UserResponse)
            : Results.Json(new ProblemResult(result.Error ?? "Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    // ── Level 4: Trick Wording ──────────────────

    static async Task<IResult> GetTrickWordingChallenge(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(TrickWordingGenerator.Generate(id.Value), AppJsonContext.Default.TrickWordingChallenge);
    }

    static async Task<IResult> SubmitTrickWording(string userId, TrickWordingSubmission submission, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var challenge = TrickWordingGenerator.Generate(id.Value);
        // None of the options should be selected — they're all traps!
        var results = challenge.Options.Select(o => new TrickWordingOptionResult(
            o.Id, o.Label, o.ActualEffect, o.ClearLabel,
            submission.SelectedOptionIds.Contains(o.Id),
            false)).ToList();
        var correct = results.Count(r => r.WasSelected == r.ShouldHaveBeenSelected);

        var updated = user.WithCompletion(4, byHuman: correct == results.Count, byAutomation: false, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);

        return Results.Json(new TrickWordingResult { Results = results, CorrectCount = correct, TotalOptions = results.Count }, AppJsonContext.Default.TrickWordingResult);
    }

    // ── Level 5: Preselection ───────────────────

    static async Task<IResult> GetSettings(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(SettingsResponse.From(user.Settings), AppJsonContext.Default.SettingsResponse);
    }

    static async Task<IResult> UpdateSettings(string userId, SettingsUpdateRequest request, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var settings = user.Settings with
        {
            NewsletterOptIn = request.NewsletterOptIn ?? user.Settings.NewsletterOptIn,
            ShareDataWithPartners = request.ShareDataWithPartners ?? user.Settings.ShareDataWithPartners,
            LocationTracking = request.LocationTracking ?? user.Settings.LocationTracking,
            PushNotifications = request.PushNotifications ?? user.Settings.PushNotifications,
        };
        var changed = SettingsResponse.From(settings).ChangedFromDefaults;
        var updated = (user with { Settings = settings, UpdatedAt = DateTimeOffset.UtcNow })
            .WithCompletion(5, byHuman: changed > 0, byAutomation: false, DateTimeOffset.UtcNow);
        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(SettingsResponse.From(result.User!.Settings), AppJsonContext.Default.SettingsResponse)
            : Results.Json(new ProblemResult("Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    // ── Level 6: Basket Sneaking ────────────────

    static readonly CartItem[] SneakableItems =
    [
        new("insurance-1", "Purchase Protection Insurance", 4.99m, false),
        new("warranty-1", "Extended Warranty (2 years)", 9.99m, false),
        new("gift-wrap-1", "Premium Gift Wrapping", 2.99m, false),
    ];

    static async Task<IResult> GetCart(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(CartResponse.From(user.Cart), AppJsonContext.Default.CartResponse);
    }

    static async Task<IResult> AddToCart(string userId, CartAddRequest request, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var item = new CartItem(request.ItemId, request.Name, request.Price, true);
        var updated = user with { Cart = user.Cart.AddItem(item), UpdatedAt = DateTimeOffset.UtcNow };
        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(CartResponse.From(result.User!.Cart), AppJsonContext.Default.CartResponse)
            : Results.Json(new ProblemResult("Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    static async Task<IResult> Checkout(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        // Dark pattern: sneak items into cart!
        var cart = user.Cart;
        foreach (var sneak in SneakableItems)
            if (!cart.Items.Any(i => i.Id == sneak.Id))
                cart = cart.AddItem(sneak);

        var updated = user with { Cart = cart, UpdatedAt = DateTimeOffset.UtcNow };
        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(CartResponse.From(result.User!.Cart), AppJsonContext.Default.CartResponse)
            : Results.Json(new ProblemResult("Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    static async Task<IResult> RemoveFromCart(string userId, string itemId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user with { Cart = user.Cart.RemoveItem(itemId), UpdatedAt = DateTimeOffset.UtcNow };
        if (user.Cart.SneakedItems.Count > 0 && updated.Cart.SneakedItems.Count == 0)
            updated = updated.WithCompletion(6, byHuman: true, byAutomation: false, DateTimeOffset.UtcNow);

        var result = await store.SaveUser(updated, ct);
        return result.Outcome == SaveOutcome.Success
            ? Results.Json(CartResponse.From(result.User!.Cart), AppJsonContext.Default.CartResponse)
            : Results.Json(new ProblemResult("Conflict", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);
    }

    // ── Level 7: Nagging ────────────────────────

    static async Task<IResult> GetNagPage(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        return Results.Json(new NagPageResponse(
            "Welcome to the content page! Here's some interesting information you wanted to read.",
            user.NagState.ShouldShowNag,
            user.NagState.ShouldShowNag ? "🔔 Upgrade to Premium!" : null,
            user.NagState.ShouldShowNag ? "Don't miss out on our exclusive premium features! Upgrade now for just $9.99/month." : null,
            user.NagState.DismissCount),
        AppJsonContext.Default.NagPageResponse);
    }

    static async Task<IResult> DismissNag(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user with { NagState = user.NagState.Dismiss(DateTimeOffset.UtcNow), UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveUser(updated, ct);
        return Results.Json(new NagDismissResponse(true, false, updated.NagState.DismissCount), AppJsonContext.Default.NagDismissResponse);
    }

    static async Task<IResult> DismissNagPermanently(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user with { NagState = user.NagState.DismissPermanently(), UpdatedAt = DateTimeOffset.UtcNow };
        updated = updated.WithCompletion(7, byHuman: true, byAutomation: false, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);
        return Results.Json(new NagDismissResponse(true, true, updated.NagState.DismissCount), AppJsonContext.Default.NagDismissResponse);
    }

    // ── Level 8: Interface Interference ─────────

    static async Task<IResult> GetInterfacePage(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(InterfaceTrap.Generate(), AppJsonContext.Default.InterfaceTrap);
    }

    static async Task<IResult> SubmitInterfaceAction(string userId, InterfaceActionSubmission submission, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var trap = InterfaceTrap.Generate();
        var chosen = trap.Actions.FirstOrDefault(a => a.Id == submission.ActionId);
        if (chosen is null)
            return Results.Json(new ProblemResult("Invalid action.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var correct = !chosen.IsDecoy;
        var updated = user.WithCompletion(8, byHuman: correct, byAutomation: false, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);
        return Results.Json(new InterfaceActionResult(chosen.Id, chosen.Label, chosen.IsDecoy, correct), AppJsonContext.Default.InterfaceActionResult);
    }

    // ── Level 9: Zuckering ──────────────────────

    static async Task<IResult> GetPermissions(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(PermissionGenerator.AllPermissions, AppJsonContext.Default.IReadOnlyListPermissionRequest);
    }

    static async Task<IResult> GrantPermissions(string userId, PermissionGrant grant, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var reveal = PermissionGenerator.AllPermissions.Select(p => new PermissionRevealEntry(
            p.PermissionId, p.DisplayLabel, p.ActualScope, p.BundledWith,
            grant.GrantedPermissionIds.Contains(p.PermissionId))).ToList();
        var excessive = reveal.Count(r => r.WasGranted);
        var minimal = excessive == 0;

        var updated = user.WithCompletion(9, byHuman: minimal, byAutomation: false, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);
        return Results.Json(new PermissionRevealResponse { Permissions = reveal, ExcessivePermissions = excessive }, AppJsonContext.Default.PermissionRevealResponse);
    }

    // ── Level 10: Emotional Manipulation ────────

    static async Task<IResult> GetUrgencyOffer(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);
        return Results.Json(UrgencyGenerator.Generate(), AppJsonContext.Default.UrgencyOffer);
    }

    static async Task<IResult> VerifyUrgency(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user.WithCompletion(10, byHuman: false, byAutomation: true, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);
        return Results.Json(new UrgencyVerifyResponse(false, false,
            "The countdown timer resets on every page load. The 'items left' number is randomly generated. Neither signal reflects reality."),
            AppJsonContext.Default.UrgencyVerifyResponse);
    }

    static async Task<IResult> PurchaseUrgency(string userId, UrgencyPurchaseRequest request, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);
        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var updated = user.WithCompletion(10, byHuman: !request.Purchased, byAutomation: false, DateTimeOffset.UtcNow);
        await store.SaveUser(updated, ct);
        return Results.Json(UserResponse.From(updated), AppJsonContext.Default.UserResponse);
    }

    // ── Level 11: Speed Trap ───────────────────

    static async Task<IResult> GetSpeedTrapChallenge(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var now = DateTimeOffset.UtcNow;
        var session = SpeedTrapGenerator.Generate(id.Value, now);
        var updated = user with { ActiveSpeedTrap = session, UpdatedAt = now };

        var save = await store.SaveUser(updated, ct);
        if (save.Outcome != SaveOutcome.Success)
            return Results.Json(new ProblemResult(save.Error ?? "Could not start challenge.", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);

        return Results.Json(SpeedTrapChallengeResponse.From(session), AppJsonContext.Default.SpeedTrapChallengeResponse);
    }

    static async Task<IResult> SubmitSpeedTrap(string userId, SpeedTrapSubmission submission, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var session = user.ActiveSpeedTrap;
        if (session is null || !string.Equals(session.ChallengeId, submission.ChallengeId, StringComparison.Ordinal))
            return Results.Json(new ProblemResult("No active speed challenge found.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var now = DateTimeOffset.UtcNow;
        var elapsedMs = Math.Max(0, (int)(now - session.IssuedAt).TotalMilliseconds);
        var deadlineMissed = now > session.DeadlineAt;
        var answerCorrect = string.Equals(
            NormalizeSpeedTrapAnswer(submission.Answer),
            NormalizeSpeedTrapAnswer(session.ExpectedAnswer),
            StringComparison.OrdinalIgnoreCase);
        var accepted = answerCorrect && !deadlineMissed;
        var solvedByAutomation = accepted && elapsedMs <= 1200;

        var updated = user with { ActiveSpeedTrap = null, UpdatedAt = now };
        if (accepted)
        {
            updated = updated.WithCompletion(11, byHuman: !solvedByAutomation, byAutomation: solvedByAutomation, now);
        }

        await store.SaveUser(updated, ct);

        var explanation = accepted
            ? solvedByAutomation
                ? "You beat the deadline in automation territory. The machine-readable hint made this trivial for Playwright."
                : "You answered in time, but only just. This level is designed to reward automation-grade speed."
            : deadlineMissed
                ? "The timer expired before the answer reached the server. Time pressure is the dark pattern here."
                : "That answer was wrong. The visual noise is meant to increase mistakes under pressure.";

        return Results.Json(
            new SpeedTrapResult(
                accepted,
                deadlineMissed,
                answerCorrect,
                elapsedMs,
                session.TimeLimitMs,
                session.ExpectedAnswer,
                explanation,
                accepted ? solvedByAutomation ? "automation" : "human" : null),
            AppJsonContext.Default.SpeedTrapResult);
    }

    static string NormalizeSpeedTrapAnswer(string value) =>
        new string((value ?? string.Empty)
            .Where(c => !char.IsWhiteSpace(c) && c != '-' && c != '/' && c != '<' && c != '>')
            .ToArray()).Trim();

    // ── Level 12: Flash Recall ─────────────────

    static async Task<IResult> GetFlashRecallChallenge(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var now = DateTimeOffset.UtcNow;
        var session = FlashRecallGenerator.Generate(id.Value, now);
        var updated = user with { ActiveFlashRecall = session, UpdatedAt = now };

        var save = await store.SaveUser(updated, ct);
        if (save.Outcome != SaveOutcome.Success)
            return Results.Json(new ProblemResult(save.Error ?? "Could not start flash recall.", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);

        return Results.Json(FlashRecallChallengeResponse.From(session), AppJsonContext.Default.FlashRecallChallengeResponse);
    }

    static async Task<IResult> SubmitFlashRecall(string userId, FlashRecallSubmission submission, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var session = user.ActiveFlashRecall;
        if (session is null || !string.Equals(session.ChallengeId, submission.ChallengeId, StringComparison.Ordinal))
            return Results.Json(new ProblemResult("No active flash recall challenge found.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var now = DateTimeOffset.UtcNow;
        var elapsedMs = Math.Max(0, (int)(now - session.IssuedAt).TotalMilliseconds);
        var deadlineMissed = now > session.DeadlineAt;
        var answerCorrect = string.Equals(
            NormalizeSpeedTrapAnswer(submission.Answer),
            NormalizeSpeedTrapAnswer(session.ExpectedAnswer),
            StringComparison.OrdinalIgnoreCase);
        var accepted = answerCorrect && !deadlineMissed;
        var solvedByAutomation = accepted && elapsedMs <= 1700;

        var updated = user with { ActiveFlashRecall = null, UpdatedAt = now };
        if (accepted)
        {
            updated = updated.WithCompletion(12, byHuman: !solvedByAutomation, byAutomation: solvedByAutomation, now);
        }

        await store.SaveUser(updated, ct);

        var explanation = accepted
            ? solvedByAutomation
                ? "The phrase only flashed for a moment, but automation could read the hidden answer key without relying on memory."
                : "You held the token in memory long enough to beat the disappearing prompt."
            : deadlineMissed
                ? "The phrase vanished and the answer arrived too late. This challenge exploits short-lived visibility."
                : "The answer drifted under pressure. The disappearing prompt is meant to force recall mistakes.";

        return Results.Json(
            new FlashRecallResult(
                accepted,
                deadlineMissed,
                answerCorrect,
                elapsedMs,
                session.ExpectedAnswer,
                explanation,
                accepted ? solvedByAutomation ? "automation" : "human" : null),
            AppJsonContext.Default.FlashRecallResult);
    }

    // ── Level 13: Needle Haystack ──────────────

    static async Task<IResult> GetNeedleHaystackChallenge(string userId, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var now = DateTimeOffset.UtcNow;
        var session = NeedleHaystackGenerator.Generate(id.Value, now);
        var updated = user with { ActiveNeedleHaystack = session, UpdatedAt = now };

        var save = await store.SaveUser(updated, ct);
        if (save.Outcome != SaveOutcome.Success)
            return Results.Json(new ProblemResult(save.Error ?? "Could not start needle challenge.", 409), AppJsonContext.Default.ProblemResult, statusCode: 409);

        return Results.Json(NeedleHaystackChallengeResponse.From(session), AppJsonContext.Default.NeedleHaystackChallengeResponse);
    }

    static async Task<IResult> SubmitNeedleHaystack(string userId, NeedleHaystackSubmission submission, IUserStore store, CancellationToken ct)
    {
        if (!UserId.TryParse(userId, out var id))
            return Results.Json(new ProblemResult("Invalid user ID.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var user = await store.GetUser(id.Value, ct);
        if (user is null)
            return Results.Json(new ProblemResult("User not found.", 404), AppJsonContext.Default.ProblemResult, statusCode: 404);

        var session = user.ActiveNeedleHaystack;
        if (session is null || !string.Equals(session.ChallengeId, submission.ChallengeId, StringComparison.Ordinal))
            return Results.Json(new ProblemResult("No active needle challenge found.", 400), AppJsonContext.Default.ProblemResult, statusCode: 400);

        var now = DateTimeOffset.UtcNow;
        var elapsedMs = Math.Max(0, (int)(now - session.IssuedAt).TotalMilliseconds);
        var accepted = string.Equals(submission.ClauseId, session.CorrectClauseId, StringComparison.Ordinal);
        var solvedByAutomation = accepted && elapsedMs <= 1500;

        var updated = user with { ActiveNeedleHaystack = null, UpdatedAt = now };
        if (accepted)
        {
            updated = updated.WithCompletion(13, byHuman: !solvedByAutomation, byAutomation: solvedByAutomation, now);
        }

        await store.SaveUser(updated, ct);

        var explanation = accepted
            ? solvedByAutomation
                ? "Automation ignored the wall of consent text and chose the only clause marked as the real opt-out."
                : "You found the one clause that actually disables tracking despite the noisy consent language."
            : "Most clauses were dressed up to sound safe while preserving tracking. Only one actually turned it off.";

        return Results.Json(
            new NeedleHaystackResult(
                accepted,
                submission.ClauseId,
                session.CorrectClauseId,
                elapsedMs,
                explanation,
                accepted ? solvedByAutomation ? "automation" : "human" : null),
            AppJsonContext.Default.NeedleHaystackResult);
    }
}
