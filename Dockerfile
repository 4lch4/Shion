FROM oven/bun:1.4.2 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:1.4.2 AS production-dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.2 AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json
COPY src ./src
# The X watcher keeps its state here, on a named volume. A new named volume
# copies this folder's owner, so the watcher can write to it as `bun`.
RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
