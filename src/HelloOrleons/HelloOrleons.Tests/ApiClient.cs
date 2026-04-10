using System.Net.Http.Json;
using HelloOrleons.Api;

namespace HelloOrleons.Tests;

public class HelloOrleonsApi(HttpClient http)
{
    public Task<HttpResponseMessage> GetRoot()
        => http.GetAsync(new Uri(Routes.Root, UriKind.Relative));

    public Task<HttpResponseMessage> GetHealth()
        => http.GetAsync(new Uri("/health", UriKind.Relative));

    public Task<HelloResponse?> SayHello(string name)
        => http.GetFromJsonAsync<HelloResponse>(Routes.Hello(name));

    public Task<HttpResponseMessage> SayHelloRaw(string name)
        => http.GetAsync(new Uri(Routes.Hello(name), UriKind.Relative));
}
