# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0.402-noble@sha256:0d99ebf1ccad15037b5c98c9fe8979d6b8dbac23812feae2277a0b277b5c5ffa AS build
WORKDIR /src

# Copy central package management + project files for layer caching
COPY global.json .editorconfig .
COPY src/Directory.Build.props .
COPY src/DarkUxChallenge/Directory.Packages.props DarkUxChallenge/
COPY src/DarkUxChallenge/DarkUxChallenge.Api/DarkUxChallenge.Api.csproj DarkUxChallenge/DarkUxChallenge.Api/
COPY src/DarkUxChallenge/DarkUxChallenge.ServiceDefaults/DarkUxChallenge.ServiceDefaults.csproj DarkUxChallenge/DarkUxChallenge.ServiceDefaults/
RUN dotnet restore DarkUxChallenge/DarkUxChallenge.Api/DarkUxChallenge.Api.csproj

# Copy source and publish
COPY src/DarkUxChallenge/ DarkUxChallenge/
RUN dotnet publish DarkUxChallenge/DarkUxChallenge.Api/DarkUxChallenge.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

# Final: ASP.NET runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0.13-noble-chiseled@sha256:84def277556c2843a44fdeefbd3145d0a2e32d8f736d0c1a7b0a96b2880b0187
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "DarkUxChallenge.Api.dll"]
