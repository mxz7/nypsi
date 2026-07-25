---
name: preferences
description: Explains the sparse key-value storage used for personal preferences, including DM delivery preferences. Use when adding, reading, updating, querying, or exporting preferences.
---

# Preferences

`Preferences` is the single sparse key-value table for all personal preferences, including DM delivery preferences. It has a composite `(userId, key)` primary key and a JSON value. Defaults and UI metadata live in `data/preferences.json`; rows are only stored for values that differ from their default.

Use the helpers in `src/utils/functions/users/preferences.ts`:

- `getPreferences()` and `updatePreference()` are the only read/write API.
- Use `getPreferencesForUsers()` when resolving preferences for many users to avoid per-user database queries.
- Setting a key back to its default removes its row.
- All preferences share one versioned per-user Redis cache entry.

Add new preferences to `data/preferences.json` and the `Preferences` interface in `src/types/Preferences.ts`. A Prisma schema change is not needed.
String option sets belong in application type files as `as const` arrays and derived unions, not as Prisma enums.

Direct Prisma filters must account for sparse defaults. Only query `Preferences` directly when the desired value is necessarily an override, such as `voteReminder = true` when its default is false. Otherwise hydrate through the helpers.
