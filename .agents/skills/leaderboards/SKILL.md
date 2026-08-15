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
