# Built from the repository root: docker build -f packages/gateway/Dockerfile .
# Only the root manifest, the lockfile and this package's manifest are copied
# before installing, so `--filter` installs this package's dependencies and
# nothing from the other workspace packages.
FROM oven/bun:1.4.4 AS production-dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/gateway/package.json ./packages/gateway/
RUN bun install --frozen-lockfile --production --ignore-scripts --filter ./packages/gateway

FROM oven/bun:1.4.4 AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Bun's isolated linker keeps packages in /app/node_modules/.bun and symlinks
# them into each workspace package's node_modules, so copy both.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/packages/gateway ./packages/gateway
COPY packages/gateway/src ./packages/gateway/src
WORKDIR /app/packages/gateway
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
