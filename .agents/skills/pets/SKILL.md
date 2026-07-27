---
name: pets
description: Maintain Nypsi's economy pets feature, including pet data, items, Prisma storage, cached functions, activation slots, the Components v2 pets command, item use, season reset, and economy bonuses. Use whenever adding, changing, displaying, activating, upgrading, or integrating pets.
---

# Pets

Keep the implementation specific to pets and consistent with existing economy patterns. Do not add a
generic effects framework, manager, repository, or separate manual upgrade flow.

## Configuration and storage

- Pet definitions live in `data/pets.json`; corresponding economy items live in `data/items.json`.
- Supported pets are `cow` (bakery), `chicken` (farm), `beaver` (fish), `tiger` (hunt),
  `fox` (mine), `eagle` (XP), `rocky` (event progress), and `shark` (gamble multi).
- Each definition has `item`, `target`, `description`, `chance`, `benefit`, and `items`.
- `chance`, `benefit`, and `items` are parallel arrays. Stored level 1 reads index 0; the array
  length is the maximum level.
- Chances are probabilities from 0 to 1. Multiply by 100 only when rolling with `percentChance` or
  displaying a percentage.
- Format descriptions by replacing `{chance}` and `{bonus}`. Farm percentage bonuses display
  `benefit * 100`; fish, hunt, and mine descriptions omit the bonus placeholder. Cow's bakery
  benefit is `1`, which doubles the output.
- Prisma storage uses the `Pet` model/table with `userId`, `petId`, `level`, `active`, and
  `activations`. Do not create migrations; regenerate Prisma after schema changes.
- Delete pets during the economy season reset and transfer them during profile transfer.

## Economy functions

Use `src/utils/functions/economy/pets.ts`.

- Preserve the cached get/add/update pattern.
- Users have one active slot plus the `pet_slots` personal upgrade, capped at five.
- `addPet` handles both unlocking and upgrading. Read the required item count for the next level,
  verify inventory, call `removeInventoryItem`, then update the pet. Do not directly mutate inventory
  rows and do not wrap the removal in a transaction because its cache invalidation occurs
  immediately.
- Serialize pet upgrades and slot activation checks with the existing pet mutex.
- `rollPet` finds the active pet for a target, rolls once, increments `activations` only on success,
  and returns the configured benefit.

## Integrations

Keep integrations as small as the comparable booster/gem logic:

- Farm: inside `getClaimable`, after other output modifiers:

```ts
if (claim) outputMulti += (await rollPet(member, "farm")) ?? 0;
```

- Fish, hunt, and mine: roll once before the existing attempt loop and add the result directly to
  `times`.
- Bakery: add the cow benefit to the total output multiplier inside `runBakery`; activation doubles
  the output.
- XP: roll eagle inside `getXpBonus` and add its benefit to `boosterEffect`, exactly like an XP
  booster. Include a multiplier breakdown entry when it activates. Do not add separate eagle logic
  to `calcEarnedGambleXp` or `calcEarnedHFMXp`.
- Event progress: apply rocky inside `addEventProgress`, after confirming the current event matches.
- Gamble multi: apply shark unconditionally inside `getGambleMulti`, alongside gems and boosters.
  Do not add an option for callers to bypass the pet benefit.

Do not recursively call command handlers, preserve durability, alter durability consumption, roll
again for pet-generated attempts, or add activation feedback messages.

## Command and item use

- Keep one command file: `src/commands/pets.ts`, with `pet` as its alias.
- Use Components v2 and the `components-v2` skill.
- Default to an active-pets overview. Show emoji, name, level, then the formatted description on a
  new `-` line.
- Keep select navigation to owned pet detail pages. Never show locked or undiscovered pets.
- Accept a pet argument for direct viewing; autocomplete only owned pets through
  `src/interactions/pet.ts`.
- When activation fails because slots are full, include an `active pets` field listing each active
  pet's emoji and name.
- Pet items are consumed through `/use`; `addPet` decides whether to unlock or upgrade. Item info
  should explain the benefit and direct users to `/use <pet>` and `/pets`.

## Verify

Run `pnpm test` after pet data changes and `make check` after implementation changes. Keep tests
limited to validating `data/pets.json`; do not hard-code a required list of pet IDs.
