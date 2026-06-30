# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# node:22-bookworm-slim ships a pre-built `node` user/group; reuse it (noop if absent).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
# Healthcheck hits /api/v1/health/ready (the readiness endpoint, which
# pings Postgres + Redis with a 1s timeout each via Terminus). We moved
# away from /health/live because main.ts sets a global prefix of `api/v1`,
# so /health/live no longer resolves — it 404s. /health/ready is the
# semantically correct choice too: liveness should fail ONLY when the
# process itself is wedged (restartable), while readiness fails when a
# downstream dep is down — the orchestrator should pull the container out
# of rotation, NOT restart it. Restarting on a transient DB blip causes
# restart loops; pulling out of rotation does not. The /api/v1 prefix is
# required because the controller is NOT excluded from setGlobalPrefix
# (adding an exclude would change the public route shape — out of scope
# for this task).
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/v1/health/ready || exit 1
CMD ["node", "dist/main.js"]
