namespace GraphOrleons.Api;

public static class Routes
{
    public const string Events = "/api/events";
    public const string Tenants = "/api/tenants";
    public const string TenantComponentsTemplate = "/api/tenants/{tenantId}/components";
    public const string ComponentDetailTemplate = "/api/tenants/{tenantId}/components/{componentName}";
    public const string TenantModelsTemplate = "/api/tenants/{tenantId}/models";
    public const string TenantGraphTemplate = "/api/tenants/{tenantId}/models/active/graph";

    public static string TenantComponents(string tenant) => TenantComponentsTemplate.Replace("{tenantId}", tenant);
    public static string ComponentDetail(string tenant, string component) =>
        ComponentDetailTemplate.Replace("{tenantId}", tenant).Replace("{componentName}", component);
    public static string TenantModels(string tenant) => TenantModelsTemplate.Replace("{tenantId}", tenant);
    public static string TenantGraph(string tenant, string model = "active") =>
        TenantModelsTemplate.Replace("{tenantId}", tenant) + $"/{model}/graph";
}
