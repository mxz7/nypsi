---
name: global-boosters
description: Track and reward actual uses of global economy boosters. Use when adding or changing a global booster, a benefit affected by one, booster expiry, or global-booster reward balancing.
---

# Global booster use rewards

- Global boosters opt into rewards with `boosterEffect.global: true` and a positive integer
  `boosterEffect.usesPerDabloon` in `data/items.json`.
- Call `trackGlobalBoosterUse()` from `src/utils/functions/economy/boosters.ts` only after the
  booster contributes to a completed action. Do not count previews such as the profile multiplier
  display or farm claim estimates.
- Progress is stored in Redis under `GLOBAL_BOOSTER_PROGRESS`, keyed by the booster database ID so
  separate activations cannot share progress.
- `checkBoosters()` consumes the progress and rewards the activating user when that booster expires.
  The successful booster-row deletion gates payout to prevent concurrent expiry checks from paying
  more than once.
- Record generated dabloons with `addItemSourceStat()` using
  `global_booster:<boosterItemId>` as the source.
