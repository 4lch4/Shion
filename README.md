# Shion

Shion is a Discord bot and a personal Software/DevOps/Site Reliability Engineering learning project. It currently provides a guild-scoped `/ping` command when a guild ID is configured, with global registration as a fallback.

## Requirements

- Bun 1.4.2
- A Discord application with a bot user
- Docker Desktop or Docker Engine with Compose for the container workflow

## Local setup

1. Install Bun and verify it with `bun --version`.
2. Install dependencies:

   ```sh
   bun install
   ```

3. Copy the environment template and fill in the Discord values:

   ```sh
   cp .env.example .env
   ```

   Use the values from the Discord Developer Portal. `DISCORD_GUILD_ID` is optional; setting it registers `/ping` in the test server immediately instead of globally.

4. Register the slash command:

   ```sh
   bun run deploy:commands
   ```

5. Start the bot:

   ```sh
   bun run dev
   ```

6. Invite the bot to a server with the `bot` and `applications.commands` OAuth scopes. Run `/ping` in that server and verify the response is `Pong!`.

## Docker Compose

Build the image and register the command:

```sh
docker compose build
docker compose --profile setup run --rm register-commands
```

Start the bot:

```sh
docker compose up -d bot
docker compose logs -f bot
```

Stop and remove the containers:

```sh
docker compose down
```

The Compose services read secrets from the local `.env` file. The bot has no inbound port because it connects to Discord over an outbound gateway connection.

## Quality checks

```sh
bun run check
bun run typecheck
bun test
```

Biome is the formatter and linter. Husky runs lint-staged, typechecking, and tests from the pre-commit hook.

## Configuration

The bot accepts these environment variables:

- `DISCORD_APP_ID` or `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID`
- `DISCORD_APP_TOKEN` or `DISCORD_TOKEN`
- `DISCORD_GUILD_ID` (optional)

Keep `.env` private. It is ignored by Git and excluded from the Docker build context.
