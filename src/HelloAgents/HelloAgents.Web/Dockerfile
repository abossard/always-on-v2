FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Workaround: serverExternalPackages are not traced into the standalone output,
# so they're missing at runtime in Docker. Copy production node_modules which
# include these packages. See https://github.com/vercel/next.js/issues/88844
COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
