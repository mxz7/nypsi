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

Use `pnpm install` for adding packages, optionally specifying `-D`, you will very rarely have to add any other fancy options

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

## Key Pitfalls

**Prisma schema edits:** do not create migrations yourself, the user will handle them once all schema changes are confirmed, use `npx prisma generate` to generate types.

**`strictNullChecks` is off:** `tsconfig.json` sets `strictNullChecks: false`. Don't rely on null-safety; validate at system boundaries explicitly.

**Data files drive tests:** Changing JSON files in `data/` may break tests in `test/`. Run `pnpm test` after any data file changes.

**Comments should describe code only**: Comments should only be used to describe code, use them only when absolutely needed, for example a complex piece of code that isn't obvious at first sight what it does - not for basic or simple things that can easily be understood.

## Skills — Further Knowledge and Helping Future Agents

Non-obvious, durable knowledge about this project is captured as **skills** under [`.agents/skills/`](.agents/skills/), following the [Agent Skills](https://agentskills.io) open standard: each skill is a directory containing a `SKILL.md` with YAML frontmatter (`name`, `description`) plus instructions. Skills are discovered automatically — no need to maintain an index here.

**This is an evolving system, not a fixed reference.** If you spend time digging up non-obvious information (from the codebase, docs, or the user) that a future agent would benefit from, capture it as a skill:

- If it clearly overlaps with an existing skill, update that skill's `SKILL.md` instead of creating a duplicate.
- Otherwise, create a new directory under `.agents/skills/<skill-name>/SKILL.md` with a clear `name` and a `description` that states what it covers and when to use it (so it surfaces for the right future tasks).
- Update a skill immediately if you change something it describes, and correct or remove notes you notice are stale/wrong even if unrelated to your current task.
- Keep each `SKILL.md` focused and brief; split out `references/`, `scripts/`, or `assets/` subdirectories inside the skill folder if it grows large.

This directory is committed to the repo and shared across any agent/tool working on it – prefer it over a private or tool-specific memory system for anything durable that future agents/contributors should see.
