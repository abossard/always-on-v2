# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble-aot AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY HelloOrleons.Api/HelloOrleons.Api.csproj HelloOrleons.Api/
COPY HelloOrleons.ServiceDefaults/HelloOrleons.ServiceDefaults.csproj HelloOrleons.ServiceDefaults/
RUN dotnet restore HelloOrleons.Api/HelloOrleons.Api.csproj

# Copy source and publish AOT
COPY . .
RUN dotnet publish HelloOrleons.Api/HelloOrleons.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: runtime-deps only (AOT = no runtime needed)
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["./HelloOrleons.Api"]
