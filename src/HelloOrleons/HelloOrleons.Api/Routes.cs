namespace HelloOrleons.Api;

public static class Routes
{
    public const string Root = "/";
    public const string HelloTemplate = "/hello/{name}";

    public static string Hello(string name) => HelloTemplate.Replace("{name}", name, StringComparison.Ordinal);
}
