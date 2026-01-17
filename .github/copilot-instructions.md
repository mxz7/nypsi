# Copilot Instructions for nypsi

## Project Overview

- **nypsi** is a Discord bot with a seasonal economy, moderation, games, and utility features.
- It uses TypeScript, Node.js, Discord.js, Prisma (PostgreSQL), Redis
- Uses Hono for a simple non-public API.
- The bot is sharded using `discord-hybrid-sharding` for scalability.
- Data models and business logic are tightly coupled with the economy, guilds, moderation, and user management systems.

## Key Architecture

- **Entry Points:**
  - `src/index.ts`: Cluster manager, process orchestration, heartbeat, and job scheduling.
  - `src/nypsi.ts`: Main Discord client logic, event registration, and cache management.
  - `src/api/server.ts`: REST API (Hono), with authentication and endpoints for bot features.
- **Database:**
  - Prisma schema in `prisma/schema.prisma`, generated client in `src/generated/prisma`.
  - Redis is used for caching and some queues.
- **Commands:**
  - Each command is a file in `src/commands/`. Command logic is self-contained, but may use shared utilities.
- **Jobs:**
  - Scheduled jobs are loaded dynamically from `dist/scheduled/jobs` via `src/scheduled/scheduler.ts`.
- **Data:**
  - Static data (items, upgrades, etc.) is in the `data/` directory as JSON.

## Developer Workflows

- **Install:** Use `pnpm install` (pnpm is required).
- **Setup:** Run `bash setup.sh` to prepare environment and required files.
- **Build:** `pnpm run build` (TypeScript incremental build to `dist/`).
- **Lint:** `pnpm run lint` (uses ESLint with caching).
- **Format:** `pnpm run format` (Prettier with cache).
- **Test:** `npx jest` (see `test/` directory for test files).
- **Prisma:**
  - Generate client: `npx prisma generate`
  - Migrate: `npx prisma migrate dev`
- **Run:** Use `pnpm run watch` for development (auto-rebuilds on changes).

## Patterns & Conventions

- **TypeScript strictness:** `noImplicitAny`, `strictFunctionTypes`, and custom path aliases (see `tsconfig.json`).
- **Cluster-aware code:** Use `ClusterManager` and `ClusterClient` for sharding logic. Avoid global state.
- **Redis:** Use for caching, rate-limiting, and some queues (see `src/init/redis.ts`).
- **Data loading:** Use `loadItems`, `loadJobs`, etc. to initialize static and dynamic data at startup.
- **Logging:** Use the custom logger in `src/utils/logger.ts` for all logs (supports Discord/webhook transports).
- **API Auth:** All API endpoints require bearer token auth (`API_AUTH` env var).
- **Economy/Items:** Extend or update economy logic via `src/utils/functions/economy/` and `data/items.json`.
- **Testing:** Place tests in `test/` and use Jest. Mocks may be needed for Discord/Redis/Prisma.

## Integration Points

- **Discord:** All bot logic is event-driven via Discord.js. See `src/models/Client.ts` for event registration.
- **API:** REST endpoints in `src/api/server.ts` (Hono framework).
- **Prisma:** All DB access via generated Prisma client. See `src/init/database.ts` for custom query logging.
- **Redis:** Used for caching, queues, and some rate-limiting.

## Examples

- Add a new command: create `src/commands/mycommand.ts` and export a handler.
- Add a new scheduled job: add a file to `src/scheduled/jobs/` exporting a `Job` object.
- Add a new static item: update `data/items.json` and reload with `loadItems()`.

## References

- [README.md](../../README.md) for features and user-facing info
- [prisma/schema.prisma](../../prisma/schema.prisma) for DB structure
- [src/index.ts](../../src/index.ts), [src/nypsi.ts](../../src/nypsi.ts) for entry points
- [src/utils/Constants.ts](../../src/utils/Constants.ts) for global constants

---

For unclear or missing conventions, review the code in `src/` and `data/`, or ask maintainers in the Discord support server.
