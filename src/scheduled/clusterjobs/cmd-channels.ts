import type { Guild } from "discord.js";
import redis from "../../init/redis";
import type { NypsiClient } from "../../models/Client";
import Constants from "../../utils/Constants";
import {
  ACTIVITY_TTL_SECONDS,
  activateCmdChannel,
  activityKey,
  archiveCmdChannel,
  describeActivity,
  getCmdChannelState,
  MIN_CHANNELS,
  RATE_LIMIT_TTL_SECONDS,
  rateLimitKey,
  RESIZE_COOLDOWN_KEY,
  RESIZE_COOLDOWN_SECONDS,
  setCmdChannelResizeCooldown,
  withCmdChannelResizeLock,
} from "../../utils/functions/guilds/cmd-channels";
import { logger } from "../../utils/logger";

const CHECK_INTERVAL_MS = 60_000;

async function checkCmdChannels(guild: Guild) {
  const state = getCmdChannelState(guild);
  if (!state) return;

  const removalCandidate = state.active.at(-1);
  const rateLimitKeys = state.active.map((channel) => rateLimitKey(channel.id));
  const keys = [
    RESIZE_COOLDOWN_KEY,
    ...(removalCandidate ? [activityKey(removalCandidate.id)] : []),
    ...rateLimitKeys,
  ];
  const [cooldown, ...activityValues] = await redis.mget(keys);
  const removalActivity = removalCandidate ? activityValues.shift() : null;
  const rateLimits = activityValues;

  const rateLimitActivity = Object.fromEntries(
    state.active.map((channel, index) => [channel.name, describeActivity(rateLimits[index])]),
  );
  const allChannelsRateLimited = rateLimits.every(Boolean);
  const belowMinimum = state.active.length < MIN_CHANNELS;
  const canAdd = state.archived.length > 0 && (belowMinimum || allChannelsRateLimited);
  const canRemove = Boolean(
    removalCandidate && state.active.length > MIN_CHANNELS && !removalActivity,
  );

  logger.debug("cmd-channels: evaluated channel capacity", {
    activeChannels: state.active.map((channel) => ({ id: channel.id, name: channel.name })),
    archivedChannels: state.archived.map((channel) => ({ id: channel.id, name: channel.name })),
    provisionedMaximum: state.active.length + state.archived.length,
    resizeCooldown: cooldown ? JSON.parse(cooldown) : null,
    belowMinimum,
    removalCandidate: removalCandidate
      ? {
          id: removalCandidate.id,
          name: removalCandidate.name,
          activity: describeActivity(removalActivity),
        }
      : null,
    rateLimits: rateLimitActivity,
    allChannelsRateLimited,
    canAdd,
    canRemove,
  });

  if (cooldown || (!canAdd && !canRemove)) return;

  await withCmdChannelResizeLock(async () => {
    if (canAdd) {
      const channel = state.archived[0];

      logger.info("cmd-channels: opening channel", {
        channelId: channel.id,
        channelName: channel.name,
        activeChannels: state.active.map((item) => item.name),
        belowMinimum,
        allChannelsRateLimited,
      });

      await activateCmdChannel(guild, channel, "automatic");
      if (rateLimitKeys.length > 0) await redis.del(...rateLimitKeys);
      await setCmdChannelResizeCooldown("automatic", "opened");
      return;
    }

    logger.info("cmd-channels: closing inactive channel", {
      channelId: removalCandidate.id,
      channelName: removalCandidate.name,
      activeChannels: state.active.map((item) => item.name),
    });

    const closed = await archiveCmdChannel(guild, removalCandidate, "automatic");
    if (!closed) return;

    await setCmdChannelResizeCooldown("automatic", "closed");
  });
}

export function startCmdChannelManager(client: NypsiClient) {
  const guild = client.guilds.cache.get(Constants.NYPSI_SERVER_ID);
  if (!guild) return;

  logger.info("cmd-channels: manager started", {
    clusterId: client.cluster.id,
    guildId: guild.id,
    shardId: guild.shardId,
    checkIntervalSeconds: CHECK_INTERVAL_MS / 1000,
    activityWindowSeconds: ACTIVITY_TTL_SECONDS,
    rateLimitWindowSeconds: RATE_LIMIT_TTL_SECONDS,
    resizeCooldownSeconds: RESIZE_COOLDOWN_SECONDS,
    minimumChannels: MIN_CHANNELS,
  });

  void checkCmdChannels(guild).catch((error) =>
    logger.error("cmd-channels: capacity check failed", { error }),
  );

  setInterval(() => {
    void checkCmdChannels(guild).catch((error) =>
      logger.error("cmd-channels: capacity check failed", { error }),
    );
  }, CHECK_INTERVAL_MS);
}
