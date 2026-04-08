using System.Text.Json.Serialization;
using GraphOrleons.Api;
using Orleans.Dashboard;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Host.UseOrleans(silo =>
{
    silo.AddMemoryGrainStorageAsDefault();
    silo.AddMemoryGrainStorage("PubSubStore");
    silo.AddMemoryStreams("TenantStream");

    var tracingEnabled = builder.Configuration.GetValue<bool>(ConfigKeys.DistributedTracing);
    if (tracingEnabled)
        silo.AddActivityPropagation();

    var clustering = builder.Configuration[ConfigKeys.OrleansClustering];
    if (clustering == "Redis")
    {
        silo.UseKubernetesHosting();
        silo.UseRedisClustering(builder.Configuration["Redis__ConnectionString"] ?? "redis:6379");
    }
    else
    {
        silo.UseLocalhostClustering();
    }

    silo.AddDashboard();
});

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.UseCors();
app.MapDefaultEndpoints();
app.MapEventEndpoints();
app.MapOrleansDashboard("/dashboard");

app.Run();

namespace GraphOrleons.Api
{
    public partial class Program;
}
