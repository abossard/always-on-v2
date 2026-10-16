# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0.402-noble@sha256:0d99ebf1ccad15037b5c98c9fe8979d6b8dbac23812feae2277a0b277b5c5ffa AS build
WORKDIR /src

COPY global.json .editorconfig .
COPY src/Directory.Build.props .
COPY src/HelloAgents/Directory.Packages.props HelloAgents/
COPY src/AlwaysOn.ServiceDefaults/Directory.Packages.props AlwaysOn.ServiceDefaults/
COPY src/AlwaysOn.Orleans/Directory.Packages.props AlwaysOn.Orleans/
COPY src/AlwaysOn.ServiceDefaults/AlwaysOn.ServiceDefaults.csproj AlwaysOn.ServiceDefaults/
COPY src/AlwaysOn.Orleans/AlwaysOn.Orleans.csproj AlwaysOn.Orleans/
COPY src/HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj HelloAgents/HelloAgents.Api/
RUN dotnet restore HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj

COPY src/AlwaysOn.ServiceDefaults/ AlwaysOn.ServiceDefaults/
COPY src/AlwaysOn.Orleans/ AlwaysOn.Orleans/
COPY src/HelloAgents/ HelloAgents/
RUN dotnet publish HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13-noble-chiseled@sha256:84def277556c2843a44fdeefbd3145d0a2e32d8f736d0c1a7b0a96b2880b0187
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "HelloAgents.Api.dll"]
