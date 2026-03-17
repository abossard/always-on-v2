FROM node:22-alpine3.21 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM joseluisq/static-web-server:2-alpine
COPY --from=build /app/dist /public

ENV SERVER_ROOT=/public
ENV SERVER_PORT=8080
ENV SERVER_FALLBACK_PAGE=/public/index.html
ENV SERVER_LOG_LEVEL=info
ENV SERVER_HEALTH=true

EXPOSE 8080
