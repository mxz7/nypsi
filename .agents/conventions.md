# Conventions

## User Facing Messages

Use `CustomEmbed` for standard messages, and `ErrorEmbed` for error messages. Only use `content` string if a mention is specifically needed.

## Commands

Create a `Command` instance and export it as default:

```ts
import { Command } from "../models/Command.js";

const cmd = new Command("name", "description", "category")
  .setAliases(["alias"])
  .setRun(async (message, send, args) => { … });

export default cmd;
```

Commands are auto-loaded from `src/commands/` at startup. See [src/models/Command.ts](../src/models/Command.ts) for full API, and [codebase-structure.md](codebase-structure.md) for slash option/subcommand patterns.

## Scheduled Jobs

Export a `Job` object from `src/scheduled/jobs/`:

```ts
export default { name: "job-name", cron: "0 * * * *", run: async (log) => { … } } satisfies Job;
```

## Interaction Handlers

Export an `InteractionHandler` or `AutocompleteHandler` from `src/interactions/`. See [src/types/InteractionHandler.ts](../src/types/InteractionHandler.ts) and [codebase-structure.md](codebase-structure.md) for routing/autocomplete/button examples.
