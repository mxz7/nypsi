import type { Guild, TextChannel } from "discord.js";
import { CategoryChannel, ChannelType } from "discord.js";
import redis from "../../../init/redis";
import type { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { RedisMutex } from "../mutex";
import sleep from "../sleep";

export const ACTIVE_CATEGORY_ID = "1246516186171314337";
export const ARCHIVE_CATEGORY_ID = "1060585526945665197";
export const MIN_CHANNELS = 3;
export const ACTIVITY_TTL_SECONDS = 600;
export const RATE_LIMIT_TTL_SECONDS = 600;
export const RESIZE_COOLDOWN_SECONDS = 1200;
const CHANNEL_NAME_PATTERN = /^cmds-(\d+)$/;

const ACTIVITY_KEY = "nypsi:cmd-channels:activity";
const RATE_LIMIT_KEY = "nypsi:cmd-channels:rate-limit";
export const RESIZE_COOLDOWN_KEY = "nypsi:cmd-channels:resize-cooldown";

const resizeMutex = new RedisMutex("nypsi:cmd-channels:resize", false, 30_000);
const ignoredActivityIds = new Set<string>();

type ActivityChannel = {
  id: string;
  guildId?: string | null;
  parentId?: string | null;
};

type RateLimitInfo = {
  majorParameter: string;
  method: string;
  retryAfter: number;
  route: string;
  timeToReset: number;
};

export type CmdChannelState = {
  active: TextChannel[];
  archived: TextChannel[];
};

type ResizeSource = "automatic" | "manual";

export function activityKey(channelId: string) {
  return `${ACTIVITY_KEY}:${channelId}`;
}

export function rateLimitKey(channelId: string) {
  return `${RATE_LIMIT_KEY}:${channelId}`;
}

function getChannelNumber(channel: TextChannel) {
  return parseInt(channel.name.match(CHANNEL_NAME_PATTERN)[1]);
}

function getCmdChannels(category: CategoryChannel) {
  return Array.from(category.children.cache.values())
    .filter(
      (channel): channel is TextChannel =>
        channel.type === ChannelType.GuildText && CHANNEL_NAME_PATTERN.test(channel.name),
    )
    .sort((a, b) => getChannelNumber(a) - getChannelNumber(b));
}

export function getCmdChannelState(guild: Guild): CmdChannelState | undefined {
  const activeCategory = guild.channels.cache.get(ACTIVE_CATEGORY_ID);
  const archiveCategory = guild.channels.cache.get(ARCHIVE_CATEGORY_ID);

  if (
    !(activeCategory instanceof CategoryChannel) ||
    !(archiveCategory instanceof CategoryChannel)
  ) {
    logger.warn("cmd-channels: categories are missing from the guild cache", {
      guildId: guild.id,
      activeCategoryFound: activeCategory instanceof CategoryChannel,
      archiveCategoryFound: archiveCategory instanceof CategoryChannel,
    });
    return;
  }

  return {
    active: getCmdChannels(activeCategory),
    archived: getCmdChannels(archiveCategory),
  };
}

export function describeActivity(value: string | null) {
  if (!value) return null;

  const timestamp = parseInt(value);

  return {
    timestamp,
    ageSeconds: Math.max(0, Math.floor((Date.now() - timestamp) / 1000)),
  };
}

export function trackCmdChannelActivity(
  channel: ActivityChannel | null,
  source: string,
  activityId?: string,
) {
  if (
    !channel ||
    channel.guildId !== Constants.NYPSI_SERVER_ID ||
    channel.parentId !== ACTIVE_CATEGORY_ID
  )
    return;

  if (activityId && ignoredActivityIds.delete(activityId)) return;

  redis.set(activityKey(channel.id), Date.now(), "EX", ACTIVITY_TTL_SECONDS).catch((error) =>
    logger.warn("cmd-channels: failed to record activity", {
      error,
      channelId: channel.id,
      source,
    }),
  );
}

export function trackCmdChannelRateLimit(client: NypsiClient, info: RateLimitInfo) {
  if (info.method !== "POST" || info.route !== "/channels/:id/messages") return;

  const channel = client.channels.cache.get(info.majorParameter);

  if (
    !channel ||
    channel.isDMBased() ||
    channel.guildId !== Constants.NYPSI_SERVER_ID ||
    !("parentId" in channel) ||
    channel.parentId !== ACTIVE_CATEGORY_ID
  )
    return;

  redis
    .set(rateLimitKey(channel.id), Date.now(), "EX", RATE_LIMIT_TTL_SECONDS)
    .then(() =>
      logger.info("cmd-channels: recorded message rate limit", {
        channelId: channel.id,
        channelName: "name" in channel ? channel.name : undefined,
        retryAfter: info.retryAfter,
        timeToReset: info.timeToReset,
      }),
    )
    .catch((error) =>
      logger.warn("cmd-channels: failed to record message rate limit", {
        error,
        channelId: channel.id,
      }),
    );
}

export async function withCmdChannelResizeLock<T>(callback: () => Promise<T>) {
  if (!(await resizeMutex.tryAcquire())) {
    logger.debug("cmd-channels: resize skipped because another process holds the lock");
    return;
  }

  try {
    return await callback();
  } finally {
    resizeMutex.release();
  }
}

async function sendOpenedMessage(channel: TextChannel, source: ResizeSource) {
  await channel
    .send({
      embeds: [
        new CustomEmbed().setDescription(
          source === "automatic"
            ? "channel has been opened due to increased activity"
            : "channel has been opened",
        ),
      ],
    })
    .catch((error) =>
      logger.warn("cmd-channels: failed to send opened message", {
        error,
        channelId: channel.id,
      }),
    );
}

async function sendClosingMessage(channel: TextChannel, source: ResizeSource) {
  return channel
    .send({
      embeds: [
        new CustomEmbed().setDescription(
          source === "automatic"
            ? "channel will be closed soon due to inactivity"
            : "channel is being closed",
        ),
      ],
    })
    .catch((error) =>
      logger.warn("cmd-channels: failed to send closing message", {
        error,
        channelId: channel.id,
      }),
    );
}

export async function activateCmdChannel(guild: Guild, channel: TextChannel, source: ResizeSource) {
  const activeCategory = guild.channels.cache.get(ACTIVE_CATEGORY_ID) as CategoryChannel;

  await channel.setParent(ACTIVE_CATEGORY_ID);
  await channel.setPosition(activeCategory.children.cache.size - 1);
  await redis.set(activityKey(channel.id), Date.now(), "EX", ACTIVITY_TTL_SECONDS);
  await sendOpenedMessage(channel, source);

  logger.info("cmd-channels: channel opened", {
    source,
    channelId: channel.id,
    channelName: channel.name,
    activeChannels: getCmdChannelState(guild)?.active.map((item) => item.name),
  });
}

export async function archiveCmdChannel(guild: Guild, channel: TextChannel, source: ResizeSource) {
  const closingMessage = await sendClosingMessage(channel, source);

  if (source === "automatic") {
    if (closingMessage) {
      ignoredActivityIds.add(closingMessage.id);
      setTimeout(() => ignoredActivityIds.delete(closingMessage.id), 30_000);
    }

    const closingStartedAt = Date.now();

    await redis.set(activityKey(channel.id), closingStartedAt, "EX", ACTIVITY_TTL_SECONDS);
    await sleep(5000);

    const latestActivity = parseInt(await redis.get(activityKey(channel.id)));

    if (latestActivity > closingStartedAt) {
      if (closingMessage) {
        await closingMessage
          .edit({
            embeds: [new CustomEmbed().setDescription("channel closure cancelled")],
          })
          .catch((error) =>
            logger.warn("cmd-channels: failed to update cancelled closing message", {
              error,
              channelId: channel.id,
            }),
          );
      }

      logger.info("cmd-channels: channel closure cancelled", {
        channelId: channel.id,
        channelName: channel.name,
        closingStartedAt,
        latestActivity,
      });

      return false;
    }
  } else {
    await sleep(5000);
  }

  await channel.setParent(ARCHIVE_CATEGORY_ID);

  logger.info("cmd-channels: channel closed", {
    source,
    channelId: channel.id,
    channelName: channel.name,
    activeChannels: getCmdChannelState(guild)?.active.map((item) => item.name),
  });

  return true;
}

export async function setCmdChannelResizeCooldown(
  source: ResizeSource,
  action: "opened" | "closed",
) {
  await redis.set(
    RESIZE_COOLDOWN_KEY,
    JSON.stringify({ source, action, timestamp: Date.now() }),
    "EX",
    RESIZE_COOLDOWN_SECONDS,
  );
}

export async function addCmdChannel(guild: Guild, source: ResizeSource = "manual") {
  return withCmdChannelResizeLock(async () => {
    const state = getCmdChannelState(guild);
    if (!state) return;

    let channel = state.archived[0];

    if (!channel) {
      const archiveCategory = guild.channels.cache.get(ARCHIVE_CATEGORY_ID) as CategoryChannel;
      const highestNumber = [...state.active, ...state.archived].reduce(
        (highest, item) => Math.max(highest, getChannelNumber(item)),
        0,
      );

      channel = await archiveCategory.children.create({
        name: `cmds-${highestNumber + 1}`,
        type: ChannelType.GuildText,
      });

      logger.info("cmd-channels: provisioned new channel", {
        source,
        channelId: channel.id,
        channelName: channel.name,
      });
    }

    await activateCmdChannel(guild, channel, source);
    await setCmdChannelResizeCooldown(source, "opened");

    return channel;
  });
}

export async function removeCmdChannel(guild: Guild, source: ResizeSource = "manual") {
  return withCmdChannelResizeLock(async () => {
    const state = getCmdChannelState(guild);
    if (!state || state.active.length <= MIN_CHANNELS) return;

    const channel = state.active.at(-1);

    await archiveCmdChannel(guild, channel, source);
    await setCmdChannelResizeCooldown(source, "closed");

    return channel;
  });
}
