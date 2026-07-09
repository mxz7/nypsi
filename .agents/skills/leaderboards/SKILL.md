---
name: leaderboards
description: Notes the leaderboard export/import conventions in src/utils/functions/economy/top.ts, including how global vs guild scope is selected. Use when adding a new leaderboard or modifying existing top/leaderboard functions.
---

# Leaderboards

- [src/utils/functions/economy/top.ts](../../../src/utils/functions/economy/top.ts) exposes one overloaded export per leaderboard type; old public `*Global` helpers were collapsed into internal `*GlobalInternal` implementations.
- Global callers should use the same leaderboard export as guild callers, selecting scope by argument shape instead of import name.
