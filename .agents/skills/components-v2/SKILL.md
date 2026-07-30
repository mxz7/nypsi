---
name: components-v2
description: Build or convert Nypsi Discord command responses using discord.js Components v2 containers, text displays, sections, separators, selects, and buttons. Use when creating or modifying a Components v2 message, converting an embed-based command UI, or implementing interactive container updates and timeout states.
---

# Components v2

Follow Nypsi's established Components v2 patterns. Use `src/commands/dabloons.ts` as the primary
reference and `src/commands/tools.ts` or `src/commands/museum.ts` for more complex navigation.

## Build the response

- Prefer `CustomContainer(member)` from `src/models/EmbedBuilders.ts` so the container uses the
  member's configured color. Use `ContainerBuilder` directly only when another color source is
  intentional.
- Compose content with `addTextDisplayComponents`, `addSectionComponents`,
  `addSeparatorComponents`, and `addActionRowComponents`.
- Put selects and buttons inside container action rows. Do not return legacy action rows beside the
  container.
- Build the container from current state each time. Set selected options, button styles, labels, and
  disabled states during that render.
- Keep one command implementation in one file. Use command aliases rather than duplicate command
  files or a `src/commands/helpers` directory.

Send the main response with:

```ts
await send({
  components: [container],
  flags: MessageFlags.IsComponentsV2,
});
```

Do not include legacy `content` or `embeds` in the same Components v2 message. Separate ephemeral
error replies may continue using `ErrorEmbed`, matching `dabloons.ts`.

## Handle interactions

- Filter collectors to the invoking user.
- Re-render the full container after state changes:

```ts
await interaction.update({ components: [await render()] });
```

- On timeout, re-render with interactive builders disabled and edit with
  `MessageFlags.IsComponentsV2`.
- Prefer a small render function over mutating previously sent component JSON.
- Preserve custom IDs across renders.

## Verify

Run `pnpm format`, then `make check`. If a removed command or helper still appears at runtime, inspect
`dist/commands`; stale compiled files can preserve deleted UI code until the build output is updated.
