# =============================================================================
# Dockerfile — MES + WMS Hummer (Next.js 15 + PostgreSQL 16)
# =============================================================================
# Build:
#   docker build -t ohmes-backend .
# Run:
#   docker run -p 3000:3000 --env-file .env ohmes-backend
# =============================================================================

FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# =============================================================================
# Dependencies
# =============================================================================
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# =============================================================================
# Build
# =============================================================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time env vars (tidak dipakai runtime, hanya untuk build)
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/placeholder

RUN pnpm build

# =============================================================================
# Production
# =============================================================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Self-migrating deploy: entrypoint menjalankan migrasi + seed sebelum
# server start (Coolify DB fully internal — tidak ada akses luar untuk
# menjalankan migrasi dari laptop).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/entrypoint.sh /entrypoint.sh
COPY --from=builder /app/scripts/alter-app-role.mjs /alter-app-role.mjs
RUN chmod +x /entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/entrypoint.sh"]
