---
name: discord-messaging
description: Explains how to send Discord messages from cron jobs that don't have a NypsiClient/gateway connection, covering WebhookClient vs the shared getRest() REST client. Use when writing or editing a scheduled job in src/scheduled/jobs/ that needs to post a message to a channel.
---

# Sending Messages Outside the Main Client

Two patterns exist in `src/scheduled/jobs/` for posting messages from cron jobs (no `NypsiClient`/gateway connection available):

1. **WebhookClient** (`discord.js`) - used when a dedicated webhook URL exists in env (e.g. `LOTTERY_HOOK`, `TOPCOMMANDS_HOOK`, per-guild `birthdayHook`). Simple, but requires a webhook to be created/stored per destination.
2. **Shared REST client** (`src/utils/rest.ts`, `getRest()`) - wraps `@discordjs/rest`, authed with `BOT_TOKEN`. Post directly to a channel with `rest.post(Routes.channelMessages(channelId), { body: { embeds: [...] } })`. Embeds must be plain JSON (`.toJSON()` on `CustomEmbed`/`EmbedBuilder` instances, not the builder objects themselves). Preferred when you already know a channel ID and don't want to manage a separate webhook URL/secret (e.g. `topbalance.ts` posts to channel `833052442069434429` this way).

`getRest(client?)` returns `client.rest` if a `NypsiClient` is passed (has an active gateway connection), otherwise a standalone REST instance - use the standalone version in jobs since they don't have a client instance.
