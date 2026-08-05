---
name: conventions
description: Describes how to structure commands, scheduled jobs, interaction handlers, logging, and user-facing messages/embeds in nypsi. Use when creating or modifying a command, a cron job in src/scheduled/jobs, an interaction/autocomplete handler, a log message, or any message sent to a user.
---

# Conventions

## File names

Use kebab-case for file names.

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

Create a `Command` instance and export it as default:

```ts
import { Command } from "../models/Command.js";

const cmd = new Command("name", "description", "category")
  .setAliases(["alias"])
  .setRun(async (message, send, args) => { … });

export default cmd;
```

Commands are auto-loaded from `src/commands/` at startup. See [src/models/Command.ts](../../../src/models/Command.ts) for full API, and the `codebase-structure` skill for slash option/subcommand patterns.

## Scheduled Jobs

Export a `Job` object from `src/scheduled/jobs/`:

```ts
export default { name: "job-name", cron: "0 * * * *", run: async (log) => { … } } satisfies Job;
```

## Interaction Handlers

Export an `InteractionHandler` or `AutocompleteHandler` from `src/interactions/`. See [src/types/InteractionHandler.ts](../../../src/types/InteractionHandler.ts) and the `codebase-structure` skill for routing/autocomplete/button examples.
