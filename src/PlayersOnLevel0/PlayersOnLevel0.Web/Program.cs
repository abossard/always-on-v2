using Hydro;
using Hydro.Configuration;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddRazorPages();
builder.Services.AddHydro();

// Register HttpClient for the API backend via Aspire service discovery
builder.Services.AddHttpClient("api", client =>
{
    client.BaseAddress = new Uri("https+http://api");
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseRouting();
app.UseAuthorization();
app.UseHydro(builder.Environment);
app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

app.Run();
