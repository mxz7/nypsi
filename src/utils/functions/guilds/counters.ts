import { GuildCounter, TrackingType } from "@prisma/client";
import { ClusterClient, ClusterManager } from "discord-hybrid-sharding";
import { ChannelType, Client, Guild, PermissionFlagsBits } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getItems } from "../economy/utils";
import ms = require("ms");

export async function updateChannel(data: GuildCounter, client: NypsiClient | ClusterManager) {
  const clusterThing = client instanceof ClusterManager ? client : client.cluster;

  const clusterHas = await clusterThing.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;
      const channel = client.channels.cache.get(channelId);

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    {
      context: { channelId: data.channel },
    },
  );

  let shard: number;

  for (const i of clusterHas) {
    if (i != "not-found") {
      shard = i;
      break;
    }
  }

  if (isNaN(shard)) {
    const errorCount = await redis.incr(`${Constants.redis.nypsi.COUNTER_ERROR}:${data.guildId}:${data.channel}`);
    await redis.expire(`${Constants.redis.nypsi.COUNTER_ERROR}:${data.guildId}:${data.channel}`, ms("30 days") / 1000);

    logger.warn(
      `counters: channel not found (${errorCount}/50)${errorCount < 50 ? "" : ", deleting counter"}`, data
    );

    if (errorCount == 50)
      await prisma.guildCounter.delete({
        where: {
          channel: data.channel,
        },
      });
    return;
  }

  const format = await getCounterText(data, clusterThing, shard);

  const res = await clusterThing.broadcastEval(
    async (c, { shard, channelId, format }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != shard) return;

      const channel = client.channels.cache.get(channelId);

      if (channel.isDMBased()) return;

      if (channel.name == format) return "no-update";

      let fail = false;

      await channel.setName(format).catch(() => {
        fail = true;
      });

      if (fail) return "failed";
      return "updated";
    },
    { context: { shard, channelId: data.channel, format } },
  );

  for (const r of res) {
    if (r) {
      if (r === "failed") {
        logger.warn("counters: failed to update counter", data);
      } else if (r === "updated") {
        logger.info(`::success updated counter for ${data.guildId} type: ${data.tracks}`);
      }
    }
  }
}

async function getCounterText(
  data: GuildCounter,
  clusterOrGuild: ClusterManager | ClusterClient<Client<boolean>> | Guild,
  shard?: number,
) {
  let value: string;

  const members: string[] = await (clusterOrGuild instanceof Guild
    ? (async () => {
        if (clusterOrGuild.memberCount !== clusterOrGuild.members.cache.size) {
          return Array.from(await clusterOrGuild.members.fetch().then((members) => members.keys()));
        }
        return Array.from(clusterOrGuild.members.cache.keys());
      })()
    : clusterOrGuild
        .broadcastEval(
          async (c, { channelId, shard }) => {
            const client = c as unknown as NypsiClient;

            if (client.cluster.id != shard) return;

            const channel = client.channels.cache.get(channelId);
            if (!channel || channel.isDMBased()) return;

            if (channel.guild.memberCount !== channel.guild.members.cache.size) {
              return Array.from(
                await channel.guild.members.fetch().then((members) => members.keys()),
              );
            }

            return Array.from(channel.guild.members.cache.keys());
          },
          { context: { channelId: data.channel, shard } },
        )
        .then((res) => {
          for (const r of res) {
            if (r) return r;
          }
          return [];
        }));

  if (data.tracks === TrackingType.HUMANS) {
    if (clusterOrGuild instanceof Guild) {
      if (clusterOrGuild.memberCount != clusterOrGuild.members.cache.size) {
        value = await clusterOrGuild.members.fetch().then((m) => m.size.toLocaleString());
      } else value = clusterOrGuild.memberCount.toLocaleString();
    } else {
      value = await clusterOrGuild
        .broadcastEval(
          async (c, { channelId, shard }) => {
            const client = c as unknown as NypsiClient;

            if (client.cluster.id != shard) return;

            const channel = client.channels.cache.get(channelId);

            if (channel.isDMBased()) return;

            if (channel.guild.memberCount != channel.guild.members.cache.size) {
              return await channel.guild.members.fetch().then((m) => m.size.toLocaleString());
            }
            return channel.guild.memberCount.toLocaleString();
          },
          { context: { channelId: data.channel, shard } },
        )
        .then((res) => {
          for (const r of res) {
            if (r) return r;
          }
        });
    }
  } else if (data.tracks === TrackingType.MEMBERS) {
    if (clusterOrGuild instanceof Guild) {
      value = clusterOrGuild.memberCount.toLocaleString();
    } else {
      value = await clusterOrGuild
        .broadcastEval(
          async (c, { channelId, shard }) => {
            const client = c as unknown as NypsiClient;

            if (client.cluster.id != shard) return;

            const channel = client.channels.cache.get(channelId);

            if (channel.isDMBased()) return;

            return channel.guild.memberCount.toLocaleString();
          },
          { context: { channelId: data.channel, shard } },
        )
        .then((res) => {
          for (const r of res) {
            if (r) return r;
          }
        });
    }
  } else if (data.tracks === TrackingType.BOOSTS) {
    if (clusterOrGuild instanceof Guild) {
      value = (clusterOrGuild.premiumSubscriptionCount || 0).toLocaleString();
    } else {
      value = await clusterOrGuild
        .broadcastEval(
          async (c, { channelId, shard }) => {
            const client = c as unknown as NypsiClient;

            if (client.cluster.id != shard) return;

            const channel = client.channels.cache.get(channelId);

            if (channel.isDMBased()) return;

            return (channel.guild.premiumSubscriptionCount || 0).toLocaleString();
          },
          { context: { channelId: data.channel, shard } },
        )
        .then((res) => {
          for (const r of res) {
            if (r) return r;
          }
        });
    }
  } else if (data.tracks === TrackingType.RICHEST_MEMBER) {
    const topMember = await prisma.economy.findFirst({
      where: {
        userId: { in: members },
      },
      select: {
        user: {
          select: {
            lastKnownUsername: true,
          },
        },
      },
      orderBy: { money: "desc" },
    });

    value = topMember?.user?.lastKnownUsername || "null";
  } else if (data.tracks === TrackingType.TOTAL_BALANCE) {
    const total = await prisma.economy.aggregate({
      where: {
        userId: { in: members },
      },
      _sum: {
        money: true,
      },
    });

    value = (total?._sum?.money || 0).toLocaleString();
  } else if (data.tracks === TrackingType.TOTAL_ITEM) {
    if (!data.totalItem || !getItems()[data.totalItem]) {
      logger.warn(`invalid item: ${JSON.stringify(data)}`);
      return;
    }

    const query = await prisma.inventory.aggregate({
      where: {
        AND: [{ userId: { in: members } }, { item: data.totalItem }],
      },
      _sum: {
        amount: true,
      },
    });

    value = (query?._sum?.amount || 0).toLocaleString();
  }

  const format = data.format.replace("%value%", value);

  if (format.length > 164) {
    logger.warn(`channel name too long: ${JSON.stringify(data)}`);
    return;
  }

  return format;
}

export async function createGuildCounter(
  guild: Guild,
  mode: TrackingType,
  item?: string,
  format?: string,
) {
  let fail = false;

  const everyone = guild.roles.cache.find((r) => r.name == "@everyone");

  const channel = await guild.channels
    .create({
      name: await getCounterText(
        { channel: undefined, format, guildId: guild.id, tracks: mode, totalItem: item },
        guild,
      ),
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        {
          id: everyone.id,
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
        },
      ],
      reason: `creating counter with type: ${TrackingType}`,
    })
    .catch(() => {
      fail = true;
    });

  if (fail || !channel) return false;

  const res = await prisma.guildCounter
    .create({
      data: {
        channel: channel.id,
        format,
        guildId: guild.id,
        tracks: mode,
        totalItem: item,
      },
    })
    .catch(() => {
      fail = true;
    });

  if (fail || !res) return false;

  return true;
}

export async function getGuildCounters(guild: Guild) {
  return await prisma.guildCounter.findMany({
    where: {
      guildId: guild.id,
    },
  });
}

export async function deleteGuildCounter(channelId: string) {
  const res = await prisma.guildCounter
    .delete({
      where: {
        channel: channelId,
      },
    })
    .catch(() => {});

  return Boolean(res);
}
