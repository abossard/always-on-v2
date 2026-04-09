# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj PlayersOnLevel0.Api/
COPY PlayersOnLevel0.ServiceDefaults/PlayersOnLevel0.ServiceDefaults.csproj PlayersOnLevel0.ServiceDefaults/
RUN dotnet restore PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj

# Copy source and publish
COPY . .
RUN dotnet publish PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: ASP.NET runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "PlayersOnLevel0.Api.dll"]
