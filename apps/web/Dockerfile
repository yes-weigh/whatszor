# === STAGE 1: Prune Workspace ===
FROM node:22-alpine AS pruner
WORKDIR /app
RUN npm install -g pnpm@9.x turbo
COPY . .
# Prune the workspace out of all the packages to only build `web`
RUN turbo prune --scope=@yesbheem/web --docker

# === STAGE 2: Build ===
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.x

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# Generate shared prisma client just in case
RUN pnpm --filter database exec prisma generate

# Build Next.js (Standalone mode needs to be enabled in next.config.js for optimal size)
# Setting environment variables needed at build time
ENV NEXT_PUBLIC_API_URL=/api/v1
RUN pnpm --filter web build

# === STAGE 3: Production Runner ===
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
ENV PORT=3000
# server.js is created by next build from the standalone output
CMD ["node", "apps/web/server.js"]
