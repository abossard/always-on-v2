using AlwaysOn.Orleans;
using HelloOrleons.Api;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseKestrelHttpsConfiguration();
builder.AddServiceDefaults();

builder.Services.Configure<GrainConfig>(builder.Configuration.GetSection(GrainConfig.Section));

builder.AddAlwaysOnOrleans();

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
