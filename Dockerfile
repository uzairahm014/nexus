# NEXUS production image — builds the Vite client and the Node API, then serves
# both (HTTP + WebSocket) from one non-root Alpine container.
#
# Alpine/musl is used deliberately: the Debian slim base ships glibc/zlib builds
# with unpatched critical advisories, so the runtime is musl-based instead.
FROM node:24-alpine AS build
WORKDIR /app
ENV NODE_ENV=development

# Build toolchain only exists in this stage; the runtime image stays minimal.
RUN apk upgrade --no-cache \
 && apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --include=dev

COPY . .

# Compile the native SQLite binding against this image's libc explicitly.
RUN npm rebuild better-sqlite3 --build-from-source

RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/app/data \
    UPLOAD_DIR=/app/uploads

RUN apk upgrade --no-cache \
 && apk add --no-cache ca-certificates libstdc++ \
 && adduser -D -u 10001 -h /app nexus \
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
