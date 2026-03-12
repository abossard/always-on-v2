# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
RUN apt-get update && apt-get install -y --no-install-recommends clang zlib1g-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj PlayersOnLevel0.Api/
COPY PlayersOnLevel0.ServiceDefaults/PlayersOnLevel0.ServiceDefaults.csproj PlayersOnLevel0.ServiceDefaults/
RUN dotnet restore PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj

# Copy source and publish AOT
COPY . .
RUN dotnet publish PlayersOnLevel0.Api/PlayersOnLevel0.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: runtime-deps only (AOT = no runtime needed)
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["./PlayersOnLevel0.Api"]
