using Microsoft.Agents.AI;

namespace HelloAgents.Api;

public static class AgentEndpoints
{
    public static WebApplication MapAgentEndpoints(this WebApplication app)
    {
        app.MapGet("/", () => Results.Content("""
            <!DOCTYPE html>
            <html><head><title>HelloAgents</title></head>
            <body>
              <h1>HelloAgents — Microsoft Agent Framework + Orleans</h1>
              <p>AI agent with function tools, powered by Azure OpenAI and Orleans grain persistence.</p>
              <h2>Endpoints</h2>
              <ul>
                <li><code>POST /api/ask</code> — Ask the agent a question (JSON body: <code>{"message": "your question"}</code>)</li>
                <li><code>GET /health</code> — Health check</li>
                <li><code>GET /scalar/v1</code> — API documentation (dev only)</li>
              </ul>
            </body></html>
            """, "text/html"));

        app.MapPost("/api/ask", async (AskRequest request, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest("Message is required.");

            var agent = context.RequestServices.GetRequiredService<AIAgent>();
            var response = await agent.RunAsync(request.Message);
            return Results.Ok(new AskResponse(response.ToString()));
        })
        .WithName("Ask")
        .WithDescription("Ask the AI agent a question. The agent can use tools to answer.");

        return app;
    }
}

public sealed record AskRequest(string Message);
public sealed record AskResponse(string Reply);
