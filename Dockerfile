# NEXUS production image — builds the Vite client and the Node API, then serves
# both (HTTP + WebSocket) from a single non-root container.
FROM node:24-slim AS build
WORKDIR /app
ENV NODE_ENV=development
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Trim to production dependencies after the build (native module already compiled).
RUN npm prune --omit=dev

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/app/data \
    UPLOAD_DIR=/app/uploads
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 nexus \
 && mkdir -p /app/data /app/uploads \
 && chown -R nexus:nexus /app

COPY --from=build --chown=nexus:nexus /app/package.json ./package.json
COPY --from=build --chown=nexus:nexus /app/node_modules ./node_modules
COPY --from=build --chown=nexus:nexus /app/server/dist ./server/dist
COPY --from=build --chown=nexus:nexus /app/server/package.json ./server/package.json
COPY --from=build --chown=nexus:nexus /app/client/dist ./client/dist

USER nexus
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
