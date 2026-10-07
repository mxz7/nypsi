---
name: discord-cache-memory
description: Investigate or reduce Nypsi gateway process memory usage, including discord.js cache limits, sweepers, bulk member fetching, and hourly cache telemetry.
---

# Discord cache memory

Client cache configuration lives in `src/nypsi.ts`. Verify behavior against the installed
discord.js source when changing it; the observations below were checked against 14.27.0.

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

The hourly `src/scheduled/jobs/botstats.ts` report includes `cacheDetails` with per-cluster
memory bytes, cache entry counts, and the five largest member/overwrite guild caches.
Channel totals come from the global cache once; threads and DM channels are subsets.
Counts indicate where to investigate, not retained byte sizes. `arrayBuffers` is included
in `external`, so do not add them. Compare steady-state heap and cache counts across similar
uptime/workload; RSS alone cannot attribute memory to Discord caches. This report does not
force garbage collection or fetch Discord resources.

See the official [cache customization guide](https://discordjs.guide/legacy/miscellaneous/cache-customization).
