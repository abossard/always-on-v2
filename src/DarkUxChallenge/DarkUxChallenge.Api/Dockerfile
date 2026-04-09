# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY DarkUxChallenge.Api/DarkUxChallenge.Api.csproj DarkUxChallenge.Api/
COPY DarkUxChallenge.ServiceDefaults/DarkUxChallenge.ServiceDefaults.csproj DarkUxChallenge.ServiceDefaults/
RUN dotnet restore DarkUxChallenge.Api/DarkUxChallenge.Api.csproj

# Copy source and publish
COPY . .
RUN dotnet publish DarkUxChallenge.Api/DarkUxChallenge.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: ASP.NET runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "DarkUxChallenge.Api.dll"]
