# Leaderboards

- [src/utils/functions/economy/top.ts](../src/utils/functions/economy/top.ts) exposes one overloaded export per leaderboard type; old public `*Global` helpers were collapsed into internal `*GlobalInternal` implementations.
- Global callers should use the same leaderboard export as guild callers, selecting scope by argument shape instead of import name.
