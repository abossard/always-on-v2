# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

COPY HelloAgents/Directory.Packages.props HelloAgents/
COPY AlwaysOn.ServiceDefaults/Directory.Packages.props AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/Directory.Packages.props AlwaysOn.Orleans/
COPY AlwaysOn.ServiceDefaults/AlwaysOn.ServiceDefaults.csproj AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/AlwaysOn.Orleans.csproj AlwaysOn.Orleans/
COPY HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj HelloAgents/HelloAgents.Api/
RUN dotnet restore HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj

COPY AlwaysOn.ServiceDefaults/ AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/ AlwaysOn.Orleans/
COPY HelloAgents/ HelloAgents/
RUN dotnet publish HelloAgents/HelloAgents.Api/HelloAgents.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "HelloAgents.Api.dll"]
