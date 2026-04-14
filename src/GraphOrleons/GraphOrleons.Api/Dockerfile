FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY GraphOrleons/Directory.Packages.props GraphOrleons/
COPY AlwaysOn.ServiceDefaults/Directory.Packages.props AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/Directory.Packages.props AlwaysOn.Orleans/
COPY AlwaysOn.ServiceDefaults/AlwaysOn.ServiceDefaults.csproj AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/AlwaysOn.Orleans.csproj AlwaysOn.Orleans/
COPY GraphOrleons/GraphOrleons.Api/GraphOrleons.Api.csproj GraphOrleons/GraphOrleons.Api/
RUN dotnet restore GraphOrleons/GraphOrleons.Api/GraphOrleons.Api.csproj

COPY AlwaysOn.ServiceDefaults/ AlwaysOn.ServiceDefaults/
COPY AlwaysOn.Orleans/ AlwaysOn.Orleans/
COPY GraphOrleons/ GraphOrleons/
RUN dotnet publish GraphOrleons/GraphOrleons.Api/GraphOrleons.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "GraphOrleons.Api.dll"]
