import type { Guild } from "discord.js";
import redis from "../../init/redis";
import type { NypsiClient } from "../../models/Client";
import Constants from "../../utils/Constants";
import type { CmdChannelState } from "../../utils/functions/guilds/cmd-channels";
import {
  ACTIVITY_TTL_SECONDS,
  ACTIVE_CATEGORY_ID,
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

type RateLimitInfo = {
  majorParameter: string;
  method: string;
  retryAfter: number;
  route: string;
  timeToReset: number;
};

type Evaluation = {
  action?: "add" | "remove";
  state?: CmdChannelState;
};

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

async function evaluateCmdChannels(guild: Guild, mutate: boolean): Promise<Evaluation> {
  const state = getCmdChannelState(guild);
  if (!state) return {};

  const removalCandidate = state.active.at(-1);
  const keys = [
    RESIZE_COOLDOWN_KEY,
    ...(removalCandidate ? [activityKey(removalCandidate.id)] : []),
    ...state.active.map((channel) => rateLimitKey(channel.id)),
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
    mutate,
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

  if (cooldown) return { state };

  if (canAdd) {
    if (mutate) {
      const channel = state.archived[0];

      await activateCmdChannel(guild, channel, "automatic");
      await redis.del(...state.active.map((item) => rateLimitKey(item.id)));
      await setCmdChannelResizeCooldown("automatic", "opened");
    }

    return { action: "add", state };
  }

  if (canRemove) {
    if (mutate) {
      await archiveCmdChannel(guild, removalCandidate, "automatic");
      await setCmdChannelResizeCooldown("automatic", "closed");
    }

    return { action: "remove", state };
  }

  return { state };
}

async function checkCmdChannels(guild: Guild) {
  const evaluation = await evaluateCmdChannels(guild, false);
  if (!evaluation.action) return;

  logger.info("cmd-channels: resize condition met", {
    action: evaluation.action,
    activeChannels: evaluation.state.active.map((channel) => channel.name),
    archivedChannels: evaluation.state.archived.map((channel) => channel.name),
  });

  await withCmdChannelResizeLock(async () => {
    const confirmed = await evaluateCmdChannels(guild, true);

    if (!confirmed.action) {
      logger.info("cmd-channels: resize condition changed while acquiring lock", {
        originalAction: evaluation.action,
      });
    }
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
