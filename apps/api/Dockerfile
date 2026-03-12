# === STAGE 1: Prune Workspace ===
FROM node:22-alpine AS pruner
WORKDIR /app
RUN npm install -g pnpm@9.x turbo
# Copy entire source
COPY . .
# Prune the workspace out of all the packages to only build `api`
RUN turbo prune --scope=@yesbheem/api --docker

# === STAGE 2: Build ===
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.x

# Copy pruned lockfile and install (caches nicely)
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy full pruned source code and build
COPY --from=pruner /app/out/full/ .
# Generate Prisma Client (needed by shared & api packages)
RUN pnpm --filter database exec prisma generate
# Build the typescript files for API
RUN pnpm --filter api build
# Build shared packages if they have custom build scripts
RUN pnpm --filter shared build || true

# Install only production dependencies for the final stage
RUN pnpm install --prod --frozen-lockfile

# === STAGE 3: Production Runner ===
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules & dist compiled files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 5000
CMD ["node", "apps/api/dist/index.js"]
