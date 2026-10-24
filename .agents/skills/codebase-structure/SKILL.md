---
name: codebase-structure
description: Explains command/interaction handler patterns, slash command option builders, Sharp image processing usage, and the sudoku-gen package status. Use when adding or modifying commands, interaction handlers (buttons/autocomplete), slash command options/subcommands, or any image generation code.
---

# Codebase Structure Notes

## Command System

Do not create a `src/commands/helpers/` directory or place shared helper modules under
`src/commands/`; this project does not use that structure. Keep command-specific helpers in the
command file, and put reusable domain logic under `src/utils/functions/` in the appropriate domain.

### Command Definition Pattern

Located in [src/commands/](../../../src/commands/) (~180 commands)

```ts
// General structure:
const cmd = new Command("name", "description", "category")
  .setAliases(["alias"])
  .setDocs("https://nypsi.xyz/wiki/...")
  .setRun(async (message, send, args) => { … });

module.exports = cmd;
```

### Slash Command Options (SlashCommandBuilder)

Commands use `cmd.slashData` to build Discord slash commands:

- `.addSubcommand()` — define subcommands (e.g., `/chess puzzle`, `/chess duel`)
- `.addStringOption()` — string parameters with optional `.addChoices()`
- `.addUserOption()` — mention/select users
- `.addIntegerOption()` — number parameters
- `.addSubcommandGroup()` — nested grouping

**Example from `/chess` command:**

```ts
cmd.slashData
  .addSubcommand((option) =>
    option
      .setName("puzzle")
      .setDescription("play a random chess puzzle")
      .addStringOption((difficulty) =>
        difficulty
          .setName("difficulty")
          .setDescription("select puzzle difficulty")
          .setRequired(false)
          .addChoices(CHESS_PUZZLE_DIFFICULTIES.map((d) => ({ name: d, value: d }))),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("duel")
      .setDescription("challenge another member to a chess game")
      .addUserOption((user) =>
        user.setName("member").setDescription("member you want to play against").setRequired(true),
      ),
  );
```

### Saved Premium Aliases

Personal aliases store a full command string. In `resolveMessageCommand()`, expand a saved target
through built-in shorthands when it is no longer a registered command, before looking up the
canonical command. This keeps aliases targeting removed standalone commands working after grouping.
Keep injected subcommand arguments first, then saved arguments, then arguments supplied at invocation.
Registered commands retain precedence over shorthands; unknown saved targets still resolve to none.

### Slash Argument Adapter

[`src/events/interactionCreate.ts`](../../../src/events/interactionCreate.ts) converts slash options
to the same positional `args` used by prefix handlers. It inserts subcommand/group names, splits
string values on spaces, and omits absent options. `logCommand()` in the command handler removes
the initial placeholder before calling the command. Named option boundaries are therefore lost:
later optional values can occupy an earlier argument's position. For independently optional inputs,
read the named options via `message.isChatInputCommand()` and `message.options.getString(...)`,
`getUser(...)`, etc.; preserve prefix argument parsing separately. Existing examples include
`mines`, `tower`, `role`, and `purge includes`. Do not globally stop splitting strings without
checking handlers that reconstruct free text with `args.join(" ")` or expect multiple tokens.

### Slash Replies

Enabling `slashEnabled` also requires every response path to acknowledge the interaction through
its supplied `send` function. Remove prefix-only `instanceof Message` guards when adding support;
replace direct `message.channel.send()` responses, including errors and pagination's initial send.
Pass `send` through helpers such as `runItemInfo(..., send)`, whose default sends to the channel.
The shared sender returns the reply message, so existing message edits and collectors can use it.
`help.ts` supports an optional named `query` for categories, commands, and multiword item searches;
its slash category lists use `/` for registered commands and the server prefix for prefix-only ones.
`networth.ts` uses an optional named `user`; `level`, `work`, and `tools` have no slash options.

Slash registration uploads only commands with `slashEnabled = true`, using each command's
`slashData.toJSON()`. Prefix aliases and shorthands do not register additional slash commands.
`reloadslash` (or `reloadslash guild`) syncs the current guild; `reloadslash global` syncs global
commands. The shared sync utility in `src/utils/functions/slash-commands.ts` fetches deployed
definitions with localizations, creates missing commands, patches changed commands by ID, and
deletes obsolete chat-input commands. Other application-command types are preserved. Options and
choices are compared in order; Discord metadata and equivalent defaults are ignored. Explicit global
interaction contexts are compared as sets; deployed `contexts: null` does not equal `[0, 1, 2]`.
Omitted global `contexts` and `integration_types` are unmanaged: existing commands retain deployed
visibility, including when patched for other changes. Removing a local setting does not reset it;
provide explicit arrays to change it. New commands use Discord's defaults for omitted settings.
Sync regression tests belong in `test/utils/slash-commands.test.ts`.
Payloads come from the loaded command registry, so rebuild and use `reload` to load code
changes before `reloadslash`. Sync failures propagate to the command instead of showing success.
`deleteslash` uses the same utility file to bulk-clear the selected scope. Registration and deletion
REST logic belong there, not in `commandhandler.ts`.

### Slash Coverage Scope

Crypto and Last.fm commands intentionally remain prefix-only. Crypto lookups are already covered
by item information (`item`, prefix alias `i`), so do not add a crypto slash command or family.
Last.fm is outside the slash parity work; do not add slash alternatives for its music commands.
A prefix command's existence does not by itself mean it needs slash coverage.

### User Information Commands

`src/commands/user.ts` owns `info`, `avatar`, `banner`, `avatar-history`, `username-history`, and
`join` subcommands. Former command names and aliases are prefix shorthands generated from its
action definitions; bare prefix `user <member>` still opens information. Avatar history remains
self-only, and history clearing always targets the invoker. Slash join lookups accept either a
user or a numeric position. Preserve the existing `avatarhistory` and `usernamehistory` cooldown
keys across prefix and slash entry points. When removing standalone command sources, also clear
their stale `dist/commands/*.js` files: incremental TypeScript builds do not remove them.

### Rating Commands

`src/commands/rate.ts` owns the ten standalone rating actions, with generated slash subcommands and
prefix shorthands for the former command names and aliases. Cooldowns retain each action's old name
and duration, and each action has its own one-minute result cache. Keep the action-specific reward,
premium probability, booster, achievement, and self-only task logic when changing the shared
dispatcher. Rating command tests belong in `test/commands/rate.test.ts`.

### Bank Commands

`src/commands/bank.ts` owns `deposit`, `withdraw`, and `rob`. Former names (`deposit`, `dep`,
`withdraw`, `with`, and `bankrob`) are prefix shorthands. Preserve the separate `deposit`,
`withdraw`, and `bankrob` cooldown keys; masks clear `cd:bankrob:<userId>`. Robbery game records
and replay anticheat checks also retain `bankrob`. Player-to-player robbery remains in `rob.ts`.

### Karma Commands

`src/commands/karma.ts` owns `balance`, `shop`, `buy`, and `help`. Bare prefix `karma [user]`
still shows a balance. `karmashop` and `ks` expand to `karma shop`, accepting the old `view`,
`buy`, `help`, and owner-only `open`/`close` arguments; `karmahelp` expands to `karma help`.
Help is independent of shop availability and cooldowns. Shop viewing and buying retain the
`karmashop` cooldown key. Keep `item-karmashop` as the buy option name for autocomplete routing.

### Command Types

```ts
// From src/models/Command.ts
export class Command {
  public name: string;
  public description: string;
  public category: CommandCategory;
  public slashData?: SlashCommandBuilder;
  public slashEnabled: boolean;
  public run: (message, send, args) => void;

  // Chainable methods:
  setPermissions(permissions: string[]);
  setAliases(aliases: string[]);
  setShorthands(shorthands: Record<string, string>);
  setRun(run: (message, send, args) => void);
  setDocs(url: string);
}

export type CommandCategory =
  | "none"
  | "animals"
  | "fun"
  | "info"
  | "money"
  | "moderation"
  | "admin"
  | "minecraft"
  | "music"
  | "utility";

export interface NypsiCommandInteraction extends CommandInteraction {
  author?: User;
  member: GuildMember;
  interaction?: boolean;
  content?: string;
}
```

---

## Interaction Handlers

Located in [src/interactions/](../../../src/interactions/). Routed by [src/utils/handlers/interactions.ts](../../../src/utils/handlers/interactions.ts).

### Types (src/types/InteractionHandler.ts)

```ts
export type InteractionHandler = {
  name: string;
  type: "interaction";
  run: (interaction: MessageComponentInteraction) => Promise<any>;
};

export type AutocompleteHandler = {
  name: string;
  type: "autocomplete";
  run: (interaction: AutocompleteInteraction) => Promise<any>;
};
```

### Autocomplete Example

**File: [src/interactions/item.ts](../../../src/interactions/item.ts)**

```ts
export default {
  name: "item",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const inventory = await getInventory(interaction.user.id);
    const items = getItems();

    let options = inventory.entries
      .map((i) => i.item)
      .filter(
        (item) =>
          item.includes(focused.value) ||
          items[item].name.includes(focused.value) ||
          items[item].aliases?.includes(focused.value),
      );

    return await interaction.respond(
      options.map((i) => ({
        name: `${items[i].emoji} ${items[i].name}`,
        value: i,
      })),
    );
  },
} as AutocompleteHandler;
```

### Button Interaction Example

**File: [src/interactions/accept_offer.ts](../../../src/interactions/accept_offer.ts)**

```ts
export default {
  name: "btn-accept-offer",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    // Handler logic with Prisma, Redis, inventory checks, etc.
  },
} as InteractionHandler;
```

### Routing Logic

**File: [src/utils/handlers/interactions.ts](../../../src/utils/handlers/interactions.ts)**

- Loads all handlers from `dist/interactions/` at startup
- Maps by handler name into `Map<string, InteractionHandler>` and `Map<string, AutocompleteHandler>`
- For autocomplete: retrieves handler by `interaction.options.getFocused(true).name`
- For button/select menu: retrieves handler by `interaction.customId` (fallback to reaction role logic)
- Namespaced component IDs use `<handler-name>:<context>`; routing first checks the exact custom ID,
  then falls back to the segment before the first `:`. Keep dynamic state outside the custom ID when
  it is too large or sensitive.
- Profile transfer checks block interactions except special IDs like `btn-confirm-profile-transfer`

---

## Image Processing with Sharp

Sharp is used in 5 files for image generation and optimization:

### 1. Chess Board Rendering ([src/utils/functions/chess/board.ts](../../../src/utils/functions/chess/board.ts))

```ts
import sharp = require("sharp");

// SVG → PNG pipeline with piece overlays
const res = await sharp(Buffer.from(baseSvg))
  .png()
  .composite(pieces) // pieces: sharp.OverlayOptions[]
  .png()
  .toBuffer();

// Individual piece SVG → PNG resize:
const png = await sharp(Buffer.from(svg))
  .resize(SQUARE_SIZE, SQUARE_SIZE, { fit: "contain" })
  .png()
  .toBuffer();
```

### 2. Guild Avatar Upload ([src/commands/guild.ts](../../../src/commands/guild.ts#L1069))

```ts
const buffer = await sharp(arrayBuffer, { animated: contentType.split("/")[1] === "gif" })
  .resize({ width: 256, height: 256, fit: "cover" })
  .toBuffer();

await uploadImage(id, buffer, contentType);
```

### 3. Color Circle Generation ([src/commands/color.ts](../../../src/commands/color.ts#L82))

```ts
const circleImage = await sharp(arrayBuffer)
  .resize(128, 128, { fit: "fill" })
  .composite([{ input: roundedEdges, blend: "dest-in" }])
  .png()
  .toBuffer();
```

### 4. Evidence Compression ([src/utils/functions/guilds/evidence.ts](../../../src/utils/functions/guilds/evidence.ts#L108))

```ts
if (contentType.split("/")[1] === "png") {
  image = await sharp(buffer).webp({ nearLossless: true }).toBuffer();
  contentType = "image/webp";
}
```

### Common Sharp Patterns

- `.resize(w, h, { fit: "cover"|"contain"|"fill" })` — resize with aspect ratio modes
- `.composite([{ input: Buffer, blend: "dest-in", left, top }])` — overlay images
- `.png()` / `.webp()` — format conversion with options
- `.rotate(deg)` — rotate image
- `.toBuffer()` — emit as Buffer

---

## sudoku-gen Package

**Status:** Used by [src/utils/functions/sudoku/game.ts](../../../src/utils/functions/sudoku/game.ts) to generate puzzles in `createSudokuGame()`.

---

## Exports and Imports

### Command Model Exports

- `Command` class with fluent API
- `NypsiCommandInteraction` — extended CommandInteraction with author + interaction flag
- `SendMessage` type — `(data) => Promise<Message<boolean>>`
- Helper: `createNypsiInteraction()` — adds author field to slash command interactions

### Interaction Handler Auto-Loading

- `loadInteractions()` — scans `dist/interactions/`, imports as ESM, registers by name
- `runInteraction()` — dispatcher that branches on interaction type
- Profile transfer middleware intercepts non-whitelisted interactions
