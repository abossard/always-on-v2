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
}
