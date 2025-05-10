import { GuildCounter, TrackingType } from "@prisma/client";
import { ClusterManager } from "discord-hybrid-sharding";
import { ChannelType, Guild, PermissionFlagsBits } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { logger } from "../../logger";
import { getItems } from "../economy/utils";

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
    logger.warn(`counter channel not found: ${JSON.stringify(data)}`);
    await prisma.guildCounter.delete({
      where: {
        channel: data.channel,
      },
    });
    return;
  }

  let value: string;

  if (data.tracks === TrackingType.HUMANS) {
    value = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

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
  } else if (data.tracks === TrackingType.MEMBERS) {
    value = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

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
  } else if (data.tracks === TrackingType.BOOSTS) {
    value = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

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
  } else if (data.tracks === TrackingType.RICHEST_MEMBER) {
    const members = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

          if (channel.isDMBased()) return;

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
      });

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
    const members = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

          if (channel.isDMBased()) return;

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
      });

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
    const members = await clusterThing
      .broadcastEval(
        async (c, { channelId, shard }) => {
          const client = c as unknown as NypsiClient;

          if (client.cluster.id != shard) return;

          const channel = await client.channels.cache.get(channelId);

          if (channel.isDMBased()) return;

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
      });

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

  const res = await clusterThing.broadcastEval(
    async (c, { shard, channelId, format }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != shard) return;

      const channel = await client.channels.cache.get(channelId);

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
        logger.warn("failed to update counter", data);
      } else if (r === "updated") {
        logger.info(`::success updated counter for ${data.guildId} type: ${data.tracks}`);
      }
    }
  }
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
      name: "creating...",
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

  await updateChannel(res, channel.client as NypsiClient);

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

  if (res) return true;
  return false;
}
