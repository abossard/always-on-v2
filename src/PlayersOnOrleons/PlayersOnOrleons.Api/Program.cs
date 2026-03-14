using PlayersOnOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Host.UseOrleans(silo =>
{
    silo.UseLocalhostClustering();
    silo.AddMemoryGrainStorageAsDefault();
});

var app = builder.Build();
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.MapDefaultEndpoints();
app.MapPlayerEndpoints();

app.Run();

namespace PlayersOnOrleons.Api
{
    public partial class Program;
}
