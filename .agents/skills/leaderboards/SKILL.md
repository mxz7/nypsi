---
name: leaderboards
description: Notes the leaderboard export/import conventions in src/utils/functions/economy/top.ts, including how global vs guild scope is selected. Use when adding a new leaderboard or modifying existing top/leaderboard functions.
---

# Leaderboards

- Leaderboard functions live in domain files under [src/utils/functions/leaderboards/](../../../src/utils/functions/leaderboards/).
- Expose one overloaded export per leaderboard type. Global and guild callers use the same export,
  selecting scope with `"global", undefined` or `"guild", guild`.
- Add user-facing leaderboard options to [src/commands/top.ts](../../../src/commands/top.ts).
- Global leaderboards that populate profile positions call `checkLeaderboardPositions()` and should
  be included in [src/scheduled/jobs/seed-leaderboards.ts](../../../src/scheduled/jobs/seed-leaderboards.ts).
- Publish website leaderboard updates with
  [publishLeaderboardUpdate()](../../../src/utils/functions/leaderboards/publish.ts). It is
  fire-and-forget, reuses one Redis pub/sub connection per active leaderboard, and closes inactive
  connections after 15 minutes.
- Named event channels use `nypsi:leaderboard:{type}` and item channels use
  `nypsi:leaderboard:item-{itemId}`. Payloads contain string fields `entityId` and `value`, plus
  optional `increment: true` for integer deltas. Send unformatted numeric strings, milliseconds for
  times, and `P{prestige} L{level}` for levels.
- Use increment events for counts and item additions/removals instead of querying the aggregate
  value. Only send an absolute time when a write establishes a new personal best.
