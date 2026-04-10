using System.Net.Http.Json;
using HelloOrleons.Api;

namespace HelloOrleons.Tests;

public class HelloOrleonsApi(HttpClient http)
{
    public Task<HttpResponseMessage> GetRoot()
        => http.GetAsync(Routes.Root);

    public Task<HttpResponseMessage> GetHealth()
        => http.GetAsync("/health");

    public Task<HelloResponse?> SayHello(string name)
        => http.GetFromJsonAsync<HelloResponse>(Routes.Hello(name));

    public Task<HttpResponseMessage> SayHelloRaw(string name)
        => http.GetAsync(Routes.Hello(name));
}
