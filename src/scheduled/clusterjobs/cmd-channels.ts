import type { Guild } from "discord.js";
import redis from "../../init/redis";
import type { NypsiClient } from "../../models/Client";
import Constants from "../../utils/Constants";
import {
  activateCmdChannel,
  ACTIVITY_TTL_SECONDS,
  activityKey,
  archiveCmdChannel,
  CLOSE_COOLDOWN_SECONDS,
  COMMAND_WINDOW_SECONDS,
  commandActivityKey,
  COMMANDS_PER_HALF_WINDOW,
  describeActivity,
  getCmdChannelState,
  MIN_CHANNELS,
  OPEN_COOLDOWN_SECONDS,
  RESIZE_COOLDOWN_KEY,
  setCmdChannelResizeCooldown,
  withCmdChannelResizeLock,
} from "../../utils/functions/guilds/cmd-channels";
import { logger } from "../../utils/logger";

const CHECK_INTERVAL_MS = 60_000;

async function getCommandActivity(channelIds: string[]) {
  const now = Date.now();
  const halfWindowMs = (COMMAND_WINDOW_SECONDS * 1000) / 2;
  const pipeline = redis.pipeline();

  for (const channelId of channelIds) {
    const key = commandActivityKey(channelId);

    pipeline.zcount(key, now - halfWindowMs * 2, now - halfWindowMs - 1);
    pipeline.zcount(key, now - halfWindowMs, now);
  }

  const results = await pipeline.exec();

  for (const [error] of results) {
    if (error) throw error;
  }

  return channelIds.map((channelId, index) => {
    const previousHalf = Number(results[index * 2][1]);
    const currentHalf = Number(results[index * 2 + 1][1]);

    return {
      channelId,
      previousHalf,
      currentHalf,
      full: previousHalf >= COMMANDS_PER_HALF_WINDOW && currentHalf >= COMMANDS_PER_HALF_WINDOW,
    };
  });
}

async function checkCmdChannels(guild: Guild) {
  const state = getCmdChannelState(guild);
  if (!state) return;

  const removalCandidate = state.active.at(-1);
  const keys = [
    RESIZE_COOLDOWN_KEY,
    ...(removalCandidate ? [activityKey(removalCandidate.id)] : []),
  ];
  const [[cooldown, ...activityValues], commandActivity] = await Promise.all([
    redis.mget(keys),
    getCommandActivity(state.active.map((channel) => channel.id)),
  ]);
  const removalActivity = removalCandidate ? activityValues.shift() : null;
  const allChannelsFull = commandActivity.every((channel) => channel.full);
  const belowMinimum = state.active.length < MIN_CHANNELS;
  const canAdd = state.archived.length > 0 && (belowMinimum || allChannelsFull);
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
    commandActivity: commandActivity.map((activity, index) => ({
      ...activity,
      channelName: state.active[index].name,
    })),
    allChannelsFull,
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
        allChannelsFull,
      });

      await activateCmdChannel(guild, channel, "automatic");
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
    commandWindowSeconds: COMMAND_WINDOW_SECONDS,
    commandsPerHalfWindow: COMMANDS_PER_HALF_WINDOW,
    openCooldownSeconds: OPEN_COOLDOWN_SECONDS,
    closeCooldownSeconds: CLOSE_COOLDOWN_SECONDS,
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
