---
name: conventions
description: Describes how to structure tests, commands, scheduled jobs, interaction handlers, logging, and user-facing messages/embeds in nypsi. Use when creating or restructuring tests, modifying a command, a cron job in src/scheduled/jobs, an interaction/autocomplete handler, a log message, or any message sent to a user.
---

# Conventions

## File names

Use kebab-case for file names.

## Tests

Mirror each source file's path under `test/`, replacing `src/` with `test/` and `.ts` with
`.test.ts`. For example, `src/utils/functions/economy/scratchies.ts` is covered by
`test/utils/functions/economy/scratchies.test.ts`; command tests follow `test/commands/`.
Split suites that cover separate source files into their corresponding test files. Keep JSON
data validation under `test/data/`, dependency-patch coverage under `test/patches/<package>/`,
and reusable mocks in `test/mocks/`. Data test names should match their data file's basename.

## Variable grouping

Group variable declarations by context and separate different groups with a blank line:

- Keep related user, database, cache, or inventory fetches together. Destructure `Promise.all`
  directly when fetching independent values concurrently.
- Keep values derived from the fetched data together in the following block.
- Keep UI construction together, such as embeds, containers, selects, and buttons, with whitespace
  separating it from fetched and derived data.
- Start another block when declarations serve a different purpose or lifecycle. Do not interleave
  fetching, domain calculations, and component construction.
- Avoid adding whitespace between declarations that form one small, cohesive operation.

## User Facing Messages

Use `CustomEmbed` for standard messages, and `ErrorEmbed` for error messages. Only use `content` string if a mention is specifically needed.

## Logging

Never await logger calls.

Format every log message as `<subject>: <message>`, using a stable lowercase subject. Include useful
identifying context in the message when it improves readability, and also include those values in
metadata for structured filtering. Keep large or noisy values, including error objects, in metadata.

## Commands

Do not import or query Prisma directly in command files. Put database access in domain utility
functions under `src/utils/functions/` and call those functions from the command.

Create a `Command` instance and export it with `module.exports` for the command loader:

```ts
import { Command } from "../models/Command.js";

const cmd = new Command("name", "description", "category")
  .setAliases(["alias"])
  .setRun(async (message, send, args) => { … });

module.exports = cmd;
```

Commands are auto-loaded from `src/commands/` at startup. See [src/models/Command.ts](../../../src/models/Command.ts) for full API, and the `codebase-structure` skill for slash option/subcommand patterns.

## Scheduled Jobs

Export a `Job` object from `src/scheduled/jobs/`:

```ts
export default { name: "job-name", cron: "0 * * * *", run: async (log) => { … } } satisfies Job;
```

## Interaction Handlers

Export an `InteractionHandler` or `AutocompleteHandler` from `src/interactions/`. See [src/types/InteractionHandler.ts](../../../src/types/InteractionHandler.ts) and the `codebase-structure` skill for routing/autocomplete/button examples.

When a component interaction replaces the message state, prefer acknowledging it directly with
`interaction.update(...)`. Avoid `deferUpdate()` followed by `message.edit(...)` unless the updated
payload cannot be prepared within Discord's acknowledgement window. When processing time is
variable, schedule `deferUpdate()` after 2,500 ms and use
`interaction.update(data).catch(() => interaction.message.edit(data))`.
