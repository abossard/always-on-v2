FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY Directory.Packages.props .
COPY GraphOrleons.Api/GraphOrleons.Api.csproj GraphOrleons.Api/
COPY GraphOrleons.ServiceDefaults/GraphOrleons.ServiceDefaults.csproj GraphOrleons.ServiceDefaults/
RUN dotnet restore GraphOrleons.Api/GraphOrleons.Api.csproj
COPY . .
RUN dotnet publish GraphOrleons.Api/GraphOrleons.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "GraphOrleons.Api.dll"]
