# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY HelloOrleons/Directory.Packages.props HelloOrleons/
COPY AlwaysOn.ServiceDefaults/Directory.Packages.props AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/Directory.Packages.props AlwaysOn.Orleans/
COPY AlwaysOn.ServiceDefaults/AlwaysOn.ServiceDefaults.csproj AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/AlwaysOn.Orleans.csproj AlwaysOn.Orleans/
COPY HelloOrleons/HelloOrleons.Api/HelloOrleons.Api.csproj HelloOrleons/HelloOrleons.Api/
RUN dotnet restore HelloOrleons/HelloOrleons.Api/HelloOrleons.Api.csproj

# Copy source and publish
COPY AlwaysOn.ServiceDefaults/ AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/ AlwaysOn.Orleans/
COPY HelloOrleons/ HelloOrleons/
RUN dotnet publish HelloOrleons/HelloOrleons.Api/HelloOrleons.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: ASP.NET runtime (Orleans needs JIT — AOT is not supported)
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "HelloOrleons.Api.dll"]
