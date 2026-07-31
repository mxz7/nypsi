---
name: xp-balance
description: Preserve Nypsi XP balance and present XP bonus breakdowns correctly. Use when modifying getXpBonus, calcEarnedGambleXp, calcEarnedHFMXp, fish/hunt/mine XP, XP upgrades or boosters, premium/level/gem XP effects, or the profile multiplier XP fields.
---

# XP Balance

Treat XP changes as balance-sensitive. Separate source collection, command-specific calculation,
and presentation.

## Calculation boundaries

Work primarily in:

- `src/utils/functions/economy/xp.ts`
- `src/commands/profile.ts` for presentation only
- fish, hunt, and mine callers when verifying integration

Keep these responsibilities separate:

- `getXpBonus(member, client, guildId)` collects account and guild-context bonus data.
- `calcEarnedGambleXp()` owns bet and gambling-multiplier adjustments.
- `calcEarnedHFMXp()` owns fish/hunt/mine item-count logic and HFM scaling.
- `profile.ts` sorts and renders prepared breakdown data. Do not reproduce XP formulas there.

Never move bet, maximum-bet, or gambling multiplier behavior into `getXpBonus()`.
Never change an earned-XP formula as an incidental refactor.

## Bonus helper semantics

`getXpBonus()` currently builds:

- `min`, starting at `5`
- `max`, calculated once as `min * 1.3`
- `boosterEffect`, the additive multiplier effect used by earned-XP functions
- `baseBreakdown`, source values added to `min`
- `multiplierBreakdown`, configured percentage-point sources
- `rawLevel`, used by command-specific logic

Base sources include capped raw level, Nitro/server boosting, premium tier, and gems. Preserve the
actual randomly generated gem value. Do not replace it with an average, expected value, or newly
generated display value.

Multiplier sources include the personal XP upgrade, active XP boosters, the active eagle pet roll,
and the official nypsi server bonus. The beginner booster is part of this path. Roll eagle in
`getXpBonus`, add its benefit to `boosterEffect`, and include its successful activation in
`multiplierBreakdown`.

When `guildId === Constants.NYPSI_SERVER_ID`, add the 7.5% official-server bonus to
`boosterEffect` as `0.075` and to `multiplierBreakdown` as `7.5`, labelled `official nypsi server`.
Pass the originating guild ID through both XP calculation helpers and every caller. Crash is hosted
only in the official server, so its calls use `Constants.NYPSI_SERVER_ID` directly.

The official-server reward also includes a 1% gamble multiplier and 3% sell multiplier. Keep the
same guild context when calling `getGambleMulti()` and `getSellMulti()` so those helpers can add
their respective named breakdown entries. Background autosell has no command guild context and
therefore does not receive the server-specific sell bonus.

Do not reinterpret a `baseBreakdown` value:

- `10.8` premium means premium added `10.8` to the minimum.
- It does not mean `216% premium`.
- It is not a per-source minimum/maximum range.
- The global `max = min * 1.3` does not turn every source into a range.

## Gamble XP invariants

Keep required-bet checks, adjusted maximum bet, percentage-of-max-bet, command multiplier, random
roll, `boosterEffect`, clamping, and final flooring inside `calcEarnedGambleXp()`.

The final `Math.floor()` means awarded XP is whole. Display XP breakdown values as whole XP without
changing the raw values used in calculation.

## Fish/hunt/mine invariants

Fish and hunt use `calcEarnedHFMXp()` directly. Mine applies its existing division after that call.
Direct XP loot awarded outside this function is separate.

HFM obtains values from `getXpBonus()` and modifies them only in the HFM path:

```ts
min *= 1 + Math.log2(1 + xpBonus.min / 5) / 200;
max *= 1 + Math.log2(1 + xpBonus.max / 6.5) / 200;
```

Then apply `xpBonus.boosterEffect` and preserve the final floor. The `/200` scaling is deliberate;
do not retune it casually.

All configured percentage sources apply to HFM. Base sources such as level, premium, Nitro, and
gems affect HFM through the logarithmic scaling. If a profile breakdown needs their HFM effect,
derive a prepared HFM breakdown in the XP domain code using the same scaling. Do not duplicate the
logarithmic calculation in `profile.ts`.

Exclude the no-bonus HFM baseline from a bonus breakdown. A default account's scaling is not a
`0.5% base` bonus source.

## Profile display

Match the existing gamble and sell convention:

```text
5% premium
```

Use compact `value source` rows:

```text
35xp level
2xp gems
1.08% level
0.03% gems
```

Requirements:

- Use separate `xp (gamble)` and `xp (fish/hunt/mine)` fields.
- Place both XP fields side-by-side on the row below gamble and sell.
- Show every active source, including premium, level, Nitro, gems, upgrades, and boosters.
- Render gamble base entries as a single whole-XP value from the breakdown, not a range.
- Render HFM effects as percentages and percentage sources as their configured percentages.
- Omit zero-value sections and sources.
- Do not use formulas, explanatory prose, arrows, multiplier notation, or tildes.
- Do not invent a `total` that mixes additive minimum XP with percentage multipliers.
- If a spacer is required by Discord's three-column inline-field grid, use a zero-width field only
  for layout.

## Balance validation

Before changing XP output:

1. Record the current final formula and identify every changed term.
2. Compare old and proposed outputs with identical item counts and controlled random inputs.
3. Test fresh accounts, level 500, level 5000, and a full grinding loadout.
4. Treat level 500 as beginner territory and level 5000 as representative of heavy players.
5. Include maximum prestige/level, personal upgrades, all boosters, Nitro, platinum/premium, and
   guild boosters in the full-loadout case.
6. Present comparable tables across cohorts and check that relative change is consistent.

Do not introduce arbitrary caps or discard helper data to force matching output. Do not describe a
refactor as balance-preserving unless the end calculation is demonstrably unchanged.

Run `make check` after changes.

## Level requirement formula

`src/utils/functions/economy/levelling-formula.ts` owns the XP required for a
level. Its `calculateLevelXp()` helper takes one raw level; keep direct level
requirements, next-prestige totals, and crate scaling routed through it.

The production curve implemented on 31 July 2026 has these locked cumulative
checkpoints:

- P20: `2,154,413` XP
- P80: `49,895,800` XP

The P80 checkpoint is 9.99% above the historical formula. Preserve the early
raw-level reset (`100` is easier than `99`) and the monotonic increase in both
complete-prestige costs and their first differences. At high prestige, the
growth between prestiges can exceed the small within-prestige reset, so do not
assume every first level after prestiging is cheaper than the preceding level.

Update `test/utils/levelling-formula.test.ts` whenever intentionally changing
the curve or its checkpoints.

## Basic crate level rewards

`cratesFormula()` in `src/utils/functions/economy/levelling-formula.ts` owns the
variable basic-crate reward granted by level-ups. Reward frequency remains:

- every 30 raw levels before P15;
- every 25 raw levels from P15;
- every 20 raw levels from P30;
- every 15 raw levels from P40 onward.

The amount uses the average XP requirement of the current prestige and a
smoothly transitioning divisor. This keeps every qualifying reward within a
prestige consistent and prevents the reward amount from decreasing at divisor
boundaries. The cumulative target before P80 is `6,119` basic crates, 0.36%
above the previous `6,097`.

Preserve monotonic qualifying rewards and check cumulative supply whenever
changing the XP curve, divisor transitions, or reward intervals. Separate fixed
milestone rewards such as Nypsi crates, 69420 crates, bronze credits, and omega
crates are not part of `cratesFormula()`.
