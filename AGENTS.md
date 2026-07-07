# nypsi – Agent Instructions

Discord bot built with TypeScript, discord.js 14, Prisma (PostgreSQL), Redis, and Hono. See [README.md](README.md) for project overview.

## Build & Test

```bash
pnpm test          # vitest run – tests validate JSON data files in data/
pnpm lint          # oxlint --type-aware --max-warnings=0
pnpm format        # oxfmt --write
pnpm validate      # format:check + test + lint

make build         # tsc --incremental → dist/
make dev           # watch + bot + worker-mentions + worker-dms (full local dev)
make check         # lint + format:check + build
```

**IMPORTANT**: use `make check` after any changes to ensure there are no lint/type errors, prefer this over tool calls for type errors.

Prisma client generates to `src/generated/prisma/` (not the default location). Import via the path alias `#generated/prisma`.

## Architecture

| Directory              | Role                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `src/commands/`        | ~180 command files, each exports a `Command` instance           |
| `src/interactions/`    | Button / select menu / autocomplete handlers                    |
| `src/events/`          | discord.js event listeners                                      |
| `src/scheduled/jobs/`  | 30+ cron jobs (type `Job` from `src/types/Jobs.ts`)             |
| `src/utils/functions/` | Domain logic (economy/, guilds/, users/, leaderboards/, …)      |
| `src/utils/handlers/`  | Command dispatch, cooldowns, interaction routing                |
| `src/init/`            | Startup singletons: database, redis, s3                         |
| `src/worker-queues/`   | BullMQ workers (mentions, dms) – separate Node processes        |
| `src/api/`             | Hono REST API (bearer-auth protected)                           |
| `src/models/`          | Core types: `Command`, `Client`, `EmbedBuilders`                |
| `src/types/`           | Shared TS interfaces (Economy, Jobs, Workers, …)                |
| `data/`                | JSON config for items, upgrades, achievements, loot pools, etc. |
| `test/`                | Vitest tests – validate JSON data files against their schemas   |

## Conventions

See [.agents/conventions.md](.agents/conventions.md) for how to structure commands, scheduled jobs, interaction handlers, and user-facing messages.

## Key Pitfalls

**Prisma schema edits:** do not create migrations yourself, the user will handle them once all schema changes are confirmed, use `npx prisma generate` to generate types. See [.agents/prisma-schema.md](.agents/prisma-schema.md) for how to edit the schema file safely.

**`strictNullChecks` is off:** `tsconfig.json` sets `strictNullChecks: false`. Don't rely on null-safety; validate at system boundaries explicitly.

**Redis caching:** see [.agents/redis-caching.md](.agents/redis-caching.md) before caching Prisma results - some models have `BigInt` fields that break plain `JSON.stringify`.

**Data files drive tests:** Changing JSON files in `data/` may break tests in `test/`. Run `pnpm test` after any data file changes.

**Comments should describe code only**: Comments should only be used to describe code, use them only when absolutely needed, for example a complex piece of code that isn't obvious at first sight what it does - not for basic or simple things that can easily be understood.

## Further Knowledge and Helping Future Agents

Check [.agents/readme.md](.agents/readme.md) first – it's a maintained index of the other files in that directory. If a file there covers what you're working on, read it before searching the codebase yourself.

If you dedicate time to searching the codebase for non-obvious information, add your findings to an existing file in `.agents/` (if the topic overlaps) or create a new one and add it to the index in `readme.md`. Keep explanations brief and to the point.

Update these files if you are changing details they describe, and correct or remove notes you notice are stale/wrong even if unrelated to your current task.

This directory is committed to the repo and shared across any agent/tool working on it – prefer it over a private or tool-specific memory system for anything durable that future agents/contributors should see.
