import {
  APIWebhook,
  ChannelType,
  RESTGetAPIGuildChannelsResult,
  RESTPostAPIChannelWebhookResult,
  Routes,
} from "discord-api-types/v10";
import { Hono } from "hono";
import { z } from "zod";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../../utils/Constants";
import { logger } from "../../utils/logger";
import { getRest } from "../../utils/rest";

const router = new Hono();
export default router;

const snowflake = z.string().regex(/^\d{17,20}$/);

const settingsSchema = z.object({
  altPunish: z.boolean(),
  disabledChannels: z.array(snowflake).max(500),
  prefixes: z
    .array(
      z
        .string()
        .min(1)
        .max(3)
        .refine((prefix) => !/[\s`*_]/.test(prefix), "prefix contains an illegal character"),
    )
    .min(1)
    .max(5)
    .refine((prefixes) => new Set(prefixes).size === prefixes.length, "prefixes must be unique"),
  slashOnly: z.boolean(),
});

const modlogsSchema = z.object({ channelId: snowflake.nullable() });

async function getGuildChannels(guildId: string) {
  try {
    const channels = (await getRest().get(
      Routes.guildChannels(guildId),
    )) as RESTGetAPIGuildChannelsResult;
    const categoryNames = new Map(
      channels
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((channel) => [channel.id, channel.name]),
    );

    return channels
      .filter(
        (channel) =>
          channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement,
      )
      .map((channel, position) => ({
        id: channel.id,
        name: channel.name,
        parentId: channel.parent_id,
        parentName: channel.parent_id ? categoryNames.get(channel.parent_id) : null,
        position,
      }));
  } catch {
    return null;
  }
}

function parseWebhookUrl(webhookUrl: string) {
  try {
    const match = new URL(webhookUrl).pathname.match(/\/api\/webhooks\/(\d+)\/([^/]+)/);

    if (!match) return null;

    return { id: match[1], token: match[2] };
  } catch {
    return null;
  }
}

async function getModlogsChannelId(guildId: string, webhookUrl: string) {
  const webhookDetails = parseWebhookUrl(webhookUrl);

  if (!webhookDetails) return null;

  try {
    const webhook = (await getRest().get(Routes.webhook(webhookDetails.id, webhookDetails.token), {
      auth: false,
    })) as APIWebhook;

    return webhook.guild_id === guildId ? (webhook.channel_id ?? null) : null;
  } catch {
    return null;
  }
}

async function deleteWebhook(webhookUrl: string) {
  const webhookDetails = parseWebhookUrl(webhookUrl);

  if (!webhookDetails) return;

  try {
    await getRest().delete(Routes.webhook(webhookDetails.id, webhookDetails.token), {
      auth: false,
    });
  } catch (error) {
    logger.warn("api: failed to delete a replaced guild modlogs webhook", { error });
  }
}

router.get("/:guildId/settings", async (c) => {
  const guildId = c.req.param("guildId");

  if (!snowflake.safeParse(guildId).success) return c.json({ error: "invalid guild" }, 400);

  const [guild, channels] = await Promise.all([
    prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        alt_punish: true,
        disabledChannels: true,
        modlogs: true,
        prefixes: true,
        slash_only: true,
      },
    }),
    getGuildChannels(guildId),
  ]);

  if (!guild || !channels) return c.json({ error: "guild not found" }, 404);

  const modlogsChannelId = guild.modlogs ? await getModlogsChannelId(guildId, guild.modlogs) : null;

  return c.json({
    channels: channels.sort((a, b) => {
      if (a.parentName !== b.parentName)
        return (a.parentName ?? "").localeCompare(b.parentName ?? "");
      return a.position - b.position;
    }),
    settings: {
      altPunish: guild.alt_punish,
      disabledChannels: guild.disabledChannels,
      modlogsChannelId,
      modlogsEnabled: Boolean(guild.modlogs),
      prefixes: guild.prefixes,
      slashOnly: guild.slash_only,
    },
  });
});

router.put("/:guildId/settings", async (c) => {
  const guildId = c.req.param("guildId");

  if (!snowflake.safeParse(guildId).success) return c.json({ error: "invalid guild" }, 400);

  const parsed = settingsSchema.safeParse(await c.req.json().catch((): null => null));

  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const channels = await getGuildChannels(guildId);

  if (!channels) return c.json({ error: "guild not found" }, 404);

  const channelIds = new Set(channels.map((channel) => channel.id));

  if (parsed.data.disabledChannels.some((channelId) => !channelIds.has(channelId))) {
    return c.json({ error: "invalid disabled channel" }, 400);
  }

  await prisma.guild.update({
    where: { id: guildId },
    data: {
      alt_punish: parsed.data.altPunish,
      disabledChannels: parsed.data.disabledChannels,
      prefixes: parsed.data.prefixes,
      slash_only: parsed.data.slashOnly,
    },
  });

  await redis.del(
    `${Constants.redis.cache.guild.ALT_PUNISH}:${guildId}`,
    `${Constants.redis.cache.guild.DISABLED_CHANNELS}:${guildId}`,
    `${Constants.redis.cache.guild.PREFIX}:${guildId}`,
    `${Constants.redis.cache.guild.SLASH_ONLY}:${guildId}`,
  );

  return c.json({ success: true });
});

router.put("/:guildId/modlogs", async (c) => {
  const guildId = c.req.param("guildId");

  if (!snowflake.safeParse(guildId).success) return c.json({ error: "invalid guild" }, 400);

  const parsed = modlogsSchema.safeParse(await c.req.json().catch((): null => null));

  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { modlogs: true },
  });

  if (!guild) return c.json({ error: "guild not found" }, 404);

  if (parsed.data.channelId === null) {
    await prisma.guild.update({ where: { id: guildId }, data: { modlogs: null } });
    await redis.del(Constants.redis.cache.guild.MODLOGS_GUILDS);

    if (guild.modlogs) await deleteWebhook(guild.modlogs);

    return c.json({ success: true });
  }

  const channels = await getGuildChannels(guildId);

  if (!channels) return c.json({ error: "guild not found" }, 404);
  if (!channels.some((channel) => channel.id === parsed.data.channelId)) {
    return c.json({ error: "invalid modlogs channel" }, 400);
  }

  let webhook: RESTPostAPIChannelWebhookResult;

  try {
    webhook = (await getRest().post(Routes.channelWebhooks(parsed.data.channelId), {
      body: { name: "nypsi" },
    })) as RESTPostAPIChannelWebhookResult;
  } catch {
    return c.json({ error: "unable to create a webhook in that channel" }, 400);
  }

  if (!webhook.token) return c.json({ error: "webhook token missing" }, 502);

  const webhookUrl = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;

  try {
    await prisma.guild.update({ where: { id: guildId }, data: { modlogs: webhookUrl } });
    await redis.del(Constants.redis.cache.guild.MODLOGS_GUILDS);
  } catch (error) {
    await deleteWebhook(webhookUrl);
    throw error;
  }

  if (guild.modlogs) await deleteWebhook(guild.modlogs);

  return c.json({ success: true });
});
