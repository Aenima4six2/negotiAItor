# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src/ src/

# Build UI (Vite) and compile server (tsc)
RUN npx vite build \
 && npx tsc -p tsconfig.server.json --outDir dist/server --noEmit false --declaration false --sourceMap false

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /app/dist/ dist/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/package.json .

RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server/index.js"]
