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

export default cmd;
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
  name: "accept-offer",
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
- Profile transfer checks block interactions except special IDs like `t-f-p-boobies`

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
