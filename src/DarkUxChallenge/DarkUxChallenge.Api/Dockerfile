# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0-noble-aot AS build
ARG TARGETARCH
WORKDIR /src

# Copy central package management + project files for layer caching
COPY Directory.Packages.props .
COPY DarkUxChallenge.Api/DarkUxChallenge.Api.csproj DarkUxChallenge.Api/
COPY DarkUxChallenge.ServiceDefaults/DarkUxChallenge.ServiceDefaults.csproj DarkUxChallenge.ServiceDefaults/
RUN dotnet restore DarkUxChallenge.Api/DarkUxChallenge.Api.csproj -a $TARGETARCH

# Copy source and publish AOT
COPY . .
RUN dotnet publish DarkUxChallenge.Api/DarkUxChallenge.Api.csproj \
    -c Release \
    -a $TARGETARCH \
    -o /app \
    --no-restore

# Final: runtime-deps only (AOT = no runtime needed)
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["./DarkUxChallenge.Api"]
