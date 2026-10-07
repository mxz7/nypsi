---
name: discord-cache-memory
description: Investigate or reduce Nypsi gateway process memory usage, including discord.js cache limits, sweepers, bulk member fetching, and hourly cache telemetry.
---

# Discord cache memory

Client cache configuration lives in `src/nypsi.ts`. Verify behavior against the installed
discord.js source when changing it; the observations below were checked against 14.27.0.

Nypsi applies `patches/discord.js@14.27.0.patch` through pnpm `patchedDependencies`.
It pools frozen overwrite bitfields and lazily constructs channel message/thread/overwrite
managers. `src/utils/discord-cache.ts` shares frozen empty zero-limit collections for the
settings in `src/nypsi.ts`; caches with retention callbacks or nonzero limits stay private.
The deployment workflow copies `patches/`; `test/discord-cache/*.test.ts` runs in the existing
Vitest suite (`pnpm test`). These tests reverse the patch into a temporary baseline and compare installed
code against stock 14.27.0. Git is required. Update the patch with `pnpm patch`/`patch-commit`,
keep the exact dependency version pinned, and commit the patch, workspace config and lockfile.
After changing library behavior, inspect telemetry for accidental lazy-manager materialisation.

- `RoleManager`, `ChannelManager`, `GuildChannelManager`, `GuildManager`, and
  `PermissionOverwriteManager` customization is unsupported. Member permissions and role
  hierarchy depend on the complete guild role cache; channel permission checks and overwrite
  edits depend on the complete overwrite cache. Nypsi also uses cache-only channel lookups
  in commands, scheduled jobs, and cross-cluster routing. Eviction needs a broader redesign.
- `UserManager.maxSize = 2500` and `GuildMemberManager.maxSize = 200` are soft limits.
  `LimitedCollection.set()` removes at most one unprotected entry per insertion and still
  inserts when every entry is protected. Lowering these numbers alone does not enforce a cap.
- Both `keepOverLimit` and sweepers protect users in `recentCommands`, defined in
  `src/utils/functions/users/commands.ts`. Its entries expire after ten days, checked hourly.
  A shorter cache protection window can inspect its timestamp without changing command
  tracking semantics. Preserve the bot's own user/member; review member update/removal
  behavior and persistent-role handling before reducing member retention.
- `cacheTimestamp` records first observation by an eviction callback, not insertion or last
  use. Its separate fifteen-minute cleanup means the five/seven-minute settings are not
  reliable TTLs. Member/user sweeps run every fifteen minutes.
- `getAllMembers()` in `src/utils/functions/guilds/members.ts` calls
  `guild.members.fetch()` and fills gateway caches. The bulk gateway fetch implementation
  does not honor `cache: false` like single-member fetches do. `getAllMembersRest()` already
  returns slim records cached in Redis without constructing discord.js members/users.
  Name lookup in `src/utils/functions/member.ts` still uses gateway bulk fetching for guilds
  of at most 1000 members. Review the three-minute cache reuse branch of `getAllMembers()`
  when tightening limits: a partial member cache must not stand in for a complete roster.
- Zero-sized thread managers do not prevent retention in `client.channels.cache` and
  `guild.channels.cache`. Default thread sweeping runs hourly and removes threads archived
  over four hours ago; shorter archived-thread retention is a supported candidate if counts
  justify it. Do not assume the two channel maps contain duplicate channel objects.
- `GuildMember.roles` and its `.cache` construct transient managers/collections referencing
  guild role objects; `GuildMember.permissions` computes a new bitfield. Repeated access can
  create allocation churn, but is not evidence of retained duplicate role objects.
- Overwrite `allow`/`deny` and role permissions are separately allocated frozen bitfields.
  Sharing equal frozen values is a possible optimization without evicting cache entries;
  overwrite objects themselves remain channel-specific. Measure value repetition and CPU
  costs before deployment. A bounded FIFO prototype had severe overhead for unique values;
  a capped pool that bypasses new values when full avoided eviction churn, but still added
  overhead on misses and cannot adapt to new common values after filling.
- `maxSize: 0` still creates a separate empty `LimitedCollection` per manager. A local
  Node 24/V8 snapshot measured roughly 200 bytes per empty collection including its Map
  table; this is version-dependent. Nypsi shares a frozen zero-limit collection to avoid
  those allocations, but only for caches with no retention callback. Keep nonzero caches
  private and test `_add`, cloning, threads, and methods returning new collections.
- Guild channels eagerly create message/thread/overwrite managers even when their caches
  are disabled or never read. The package patch uses lazy managers. Savings
  depend on how many channels are touched; permission checks and channel cloning can
  materialize overwrite managers. Retaining raw overwrite payloads must preserve patches,
  snapshots, serialization, REST behavior, and permission precedence. Telemetry must inspect
  own descriptors instead of reading lazy getters and accidentally warming every channel.
- Nypsi uses Prisma 7 with `engineType = "client"` and `@prisma/adapter-pg`, not the
  legacy native query engine. Its generated client still lazily loads a WebAssembly query
  compiler: import-only memory measurements miss that cost. Warm real queries with a mock
  adapter when comparing ORM overhead without a live database. Drizzle can use the same
  pg driver, so pool memory and application result caches are not automatic ORM savings.
- On Debian with default Node, investigate native allocations alongside Discord caches.
  RSS minus `heapTotal` includes native allocations and mappings, not just fragmentation.
  Node documents glibc fragmentation; Sharp recommends allocator tuning. Compare equivalent
  workloads and observe actual Sharp concurrency: changing allocator settings can change
  Sharp's default concurrency as well. Do not assume the entire RSS gap is reclaimable.
- Do not assume discord.js v14 has extensive automated permission behavior coverage. Its
  package test script focuses on documentation/types. Permission-sharing experiments need
  explicit runtime tests for precedence, updates, old snapshots, REST edits, and cloning,
  ideally compared against the unpatched version.

The hourly `src/scheduled/jobs/botstats.ts` report includes `cacheDetails` with per-cluster
memory bytes, cache entry counts, and the five largest member/overwrite guild caches.
It also reports V8 physical/malloced memory, Linux `smaps_rollup` fields in KiB (or null),
Node/allocator settings, already-loaded Sharp cache/concurrency/counters, channel types,
disabled-cache bindings, and overwrite-value repetition against a bounded 1024-value pool.
The repetition estimate follows current cache iteration order, not historical insertion order.
Channel totals come from the global cache once; threads and DM channels are subsets.
Counts indicate where to investigate, not retained byte sizes. `arrayBuffers` is included
in `external`, so do not add them. Compare steady-state heap and cache counts across similar
uptime/workload; RSS alone cannot attribute memory to Discord caches. This report does not
force garbage collection or fetch Discord resources.

See the official [cache customization guide](https://discordjs.guide/legacy/miscellaneous/cache-customization).
