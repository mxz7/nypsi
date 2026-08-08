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
  `activations`, plus an optional custom `name`. Do not create migrations; regenerate Prisma after
  schema changes.
- Delete pets during the economy season reset and transfer them during profile transfer.

## Naming

- Paid naming logic lives in `src/utils/functions/economy/pet-names.ts`. The first named pet costs
  $10 million and each additional currently named pet adds $10 million. Renaming uses the current
  next-name price; removing a name always costs $5 million.
- Pet names are limited to 16 characters and two words. They may contain only ASCII letters and
  numbers, with one ordinary space separating the words, and must pass `isUserContentAllowed` with
  `pet name` as the moderation source. Enforce the local format with `isValidPetName` in both the
  command and the naming domain function.
- Use `getPetDisplayName` when directly referring to a user's pet, including activation notices and
  upgrade results. Keep the base species/category label in economy breakdowns so their source stays
  clear.
- In the pets command, keep the species as the page heading and select label and show the custom
  name as a separate field.

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

- Fish, hunt, and mine: get the active pet, roll once before the existing attempt loop, and add the
  result directly to `times`. When it activates, append `formatPetFoundItem` below the existing
  command description; do not add a separate embed field. Use `takePetFoundItem` after reward and
  progress calculations to move one item type and its full quantity out of the normal displayed
  list and onto the pet line without changing actual rewards. If there is no real item, say the pet
  found nothing.
- Bakery: add the cow benefit to the total output multiplier inside `runBakery`; activation doubles
  the output.
- XP: roll eagle inside `getXpBonus` and add its benefit to `boosterEffect`, exactly like an XP
  booster. Include a multiplier breakdown entry when it activates. Do not add separate eagle logic
  to `calcEarnedGambleXp` or `calcEarnedHFMXp`.
- Event progress: apply rocky inside `addEventProgress`, after confirming the current event matches.
- Gamble multi: apply shark unconditionally inside `getGambleMulti`, alongside gems and boosters.
  Do not add an option for callers to bypass the pet benefit.

Do not recursively call command handlers, preserve durability, alter durability consumption, or
roll again for pet-generated attempts.

After a successful activation count update, bakery, fish, hunt, and mine show the contribution in
their command response. For other targets, `trackPetActivation` stores per-user counts and the
window start time under `Constants.redis.nypsi.PET_ACTIVATIONS`. On each activation, if the window
is at least one hour old, add one inline notification with the total activation count and clear it;
otherwise update the stored count. Do not use a scheduled job for these summaries. Clear pending
counts when `dms.petActivation` is disabled. Use `ms` for the window and Redis TTL durations.

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
- Pet detail views include a level-up button. Render it green when the current inventory has enough
  pet items and disabled otherwise. On click, call `addPet` so inventory is checked again under the
  pet mutex before items are removed and the level is updated.
- Pet items are consumed through `/use`; `addPet` decides whether to unlock or upgrade. Item info
  should explain the benefit and direct users to `/use <pet>` and `/pets`.

## Verify

Run `pnpm test` after pet data changes and `make check` after implementation changes. Keep tests
limited to validating `data/pets.json`; do not hard-code a required list of pet IDs.
