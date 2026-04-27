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

### Commands

Create a `Command` instance and export it as default:

```ts
import { Command } from "../models/Command.js";

const cmd = new Command("name", "description", "category")
  .setAliases(["alias"])
  .setRun(async (message, send, args) => { … });

export default cmd;
```

Commands are auto-loaded from `src/commands/` at startup. See [src/models/Command.ts](src/models/Command.ts) for full API.

### Scheduled Jobs

Export a `Job` object from `src/scheduled/jobs/`:

```ts
export default { name: "job-name", cron: "0 * * * *", run: async (log) => { … } } satisfies Job;
```

### Interaction Handlers

Export an `InteractionHandler` or `AutocompleteHandler` from `src/interactions/`. See [src/types/InteractionHandler.ts](src/types/InteractionHandler.ts).

## Key Pitfalls

**BigInt & Redis:** Several Prisma models use `BigInt` fields (e.g. `ProfileView`). Plain `JSON.stringify` throws on BigInt. Use the custom `RedisCache` class from `src/utils/cache.ts` which handles BigInt serialization/deserialization automatically.

**Prisma schema edits:** When modifying `prisma/schema.prisma`, replace the entire model block rather than inserting partial lines near block boundaries – partial edits at model edges can corrupt the schema.

**`strictNullChecks` is off:** `tsconfig.json` sets `strictNullChecks: false`. Don't rely on null-safety; validate at system boundaries explicitly.

**Data files drive tests:** Changing JSON files in `data/` may break tests in `test/`. Run `pnpm test` after any data file changes.
