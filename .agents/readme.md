# agents

This is where knowledge written by AI goes: any non-obvious information about the project that could be useful for future agents. Write briefly, add a new file per topic (or extend an existing one if it clearly overlaps), and keep this index up to date.

## Index

- [codebase-structure.md](codebase-structure.md) — command/interaction handler patterns, sharp image processing usage, sudoku-gen package status, command model exports.
- [conventions.md](conventions.md) — how to structure commands, scheduled jobs, interaction handlers, and user-facing messages.
- [discord-messaging.md](discord-messaging.md) — sending messages from cron jobs without a gateway client (`WebhookClient` vs the shared `getRest()` REST client).
- [leaderboards.md](leaderboards.md) — leaderboard export/import conventions in `src/utils/functions/economy/top.ts`.
- [prisma-schema.md](prisma-schema.md) — safely editing `prisma/schema.prisma` without corrupting model blocks, and regenerating the client.
- [redis-caching.md](redis-caching.md) — `BigInt` fields breaking naive JSON caching, and the `RedisCache` fix.
