# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src

COPY Directory.Packages.props .
COPY HelloAgents.Api/HelloAgents.Api.csproj HelloAgents.Api/
COPY HelloAgents.ServiceDefaults/HelloAgents.ServiceDefaults.csproj HelloAgents.ServiceDefaults/
RUN dotnet restore HelloAgents.Api/HelloAgents.Api.csproj

COPY . .
RUN dotnet publish HelloAgents.Api/HelloAgents.Api.csproj \
    -c Release \
    -o /app \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "HelloAgents.Api.dll"]
