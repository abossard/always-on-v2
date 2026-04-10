using System.Net.Http.Json;
using System.Text.Json;
using GraphOrleons.Api;

namespace GraphOrleons.Tests;

public class GraphOrleonsApi(HttpClient http)
{
    public async Task PostEvent(string tenant, string component, object? payload = null)
    {
        var response = await http.PostAsJsonAsync(Routes.Events, new { tenant, component, payload });
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException(
                $"POST /api/events returned {(int)response.StatusCode}: {body[..Math.Min(body.Length, 500)]}");
        }
    }

    public Task<HttpResponseMessage> PostEventRaw(string tenant, string component, object? payload = null)
        => http.PostAsJsonAsync(Routes.Events, new { tenant, component, payload });

    public Task<string[]?> GetTenants()
        => http.GetFromJsonAsync<string[]>(Routes.Tenants);

    public Task<string[]?> GetComponents(string tenant)
        => http.GetFromJsonAsync<string[]>(Routes.TenantComponents(tenant));

    public Task<JsonElement> GetGraph(string tenant, string model = "active")
        => http.GetFromJsonAsync<JsonElement>(Routes.TenantGraph(tenant, model));

    public Task<JsonElement> GetModels(string tenant)
        => http.GetFromJsonAsync<JsonElement>(Routes.TenantModels(tenant));

    public Task<JsonElement> GetComponentDetail(string tenant, string component)
        => http.GetFromJsonAsync<JsonElement>(Routes.ComponentDetail(tenant, component));
}
