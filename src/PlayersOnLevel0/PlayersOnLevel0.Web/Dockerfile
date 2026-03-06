# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY PlayersOnLevel0.Web/PlayersOnLevel0.Web.csproj PlayersOnLevel0.Web/
COPY PlayersOnLevel0.ServiceDefaults/PlayersOnLevel0.ServiceDefaults.csproj PlayersOnLevel0.ServiceDefaults/
RUN dotnet restore PlayersOnLevel0.Web/PlayersOnLevel0.Web.csproj

# Copy source and publish
COPY . .
RUN dotnet publish PlayersOnLevel0.Web/PlayersOnLevel0.Web.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: ASP.NET runtime (Hydro needs full runtime, not AOT)
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "PlayersOnLevel0.Web.dll"]
