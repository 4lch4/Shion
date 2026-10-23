# Built from the repository root: docker build -f packages/opencode-watcher/Dockerfile .
# Only the root manifest, the lockfile and the manifests of this package and the
# workspace package it uses are copied before installing, so `--filter` installs
# this package's dependencies and nothing from the Gateway's.
FROM oven/bun:1.4.4 AS production-dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/watcher-kit/package.json ./packages/watcher-kit/
COPY packages/opencode-watcher/package.json ./packages/opencode-watcher/
RUN bun install --frozen-lockfile --production --ignore-scripts --filter ./packages/opencode-watcher

FROM oven/bun:1.4.4 AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Bun's isolated linker keeps packages in /app/node_modules/.bun and symlinks
# them into each workspace package's node_modules, so copy both.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/packages/watcher-kit ./packages/watcher-kit
COPY --from=production-dependencies /app/packages/opencode-watcher ./packages/opencode-watcher
COPY packages/watcher-kit/src ./packages/watcher-kit/src
COPY packages/opencode-watcher/src ./packages/opencode-watcher/src
# The state file and the heartbeat live here, on a named volume.
RUN mkdir -p /app/data && chown bun:bun /app/data
WORKDIR /app/packages/opencode-watcher
USER bun
CMD ["bun", "run", "src/index.ts"]
