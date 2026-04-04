using HelloOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Host.UseOrleans(silo =>
{
    silo.AddMemoryGrainStorageAsDefault();

    var tracingEnabled = builder.Configuration.GetValue<bool>("DISTRIBUTED_TRACING_ENABLED");
    if (tracingEnabled)
    {
        silo.AddActivityPropagation();
    }

    var clustering = builder.Configuration["ORLEANS_CLUSTERING"];
    if (clustering == "Redis")
    {
        silo.UseKubernetesHosting();
        silo.UseRedisClustering(builder.Configuration["Redis__ConnectionString"] ?? "redis:6379");
    }
    else
    {
        silo.UseLocalhostClustering();
    }
});

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.MapDefaultEndpoints();
app.MapHelloEndpoints();

app.Run();

namespace HelloOrleons.Api
{
    public partial class Program;
}
