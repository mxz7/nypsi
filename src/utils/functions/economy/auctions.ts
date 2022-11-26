import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, MessageActionRowComponentBuilder } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getItems } from "./utils";
import ms = require("ms");

export async function getAuctions(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.auction.findMany({
    where: {
      AND: [{ ownerId: id }, { sold: false }],
    },
  });

  return query;
}

export async function getAuctionByMessage(id: string) {
  const auction = await prisma.auction.findUnique({
    where: {
      messageId: id,
    },
  });

  return auction;
}

export async function deleteAuction(id: string, client: NypsiClient) {
  const auction = await prisma.auction
    .findFirst({
      where: {
        AND: [{ id: id }, { sold: false }],
      },
      select: {
        messageId: true,
      },
    })
    .catch(() => {});

  if (auction) {
    await prisma.auction.delete({
      where: {
        messageId: auction.messageId,
      },
      select: {
        id: true,
      },
    });

    await client.cluster.broadcastEval(
      async (client, { id }) => {
        const guild = await client.guilds.fetch("747056029795221513");

        if (!guild) return;

        const channel = await guild.channels.fetch("1008467335973179482");

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.messages.fetch(id).catch(() => {});

          if (msg) await msg.delete().catch(() => {});
        }
      },
      { context: { id: auction.messageId } }
    );
  }

  return Boolean(auction);
}

export async function createAuction(member: GuildMember, itemId: string, itemAmount: number, bin: number) {
  const embed = new CustomEmbed(member).setHeader(`${member.user.username}'s auction`, member.user.avatarURL());

  const items = getItems();

  embed.setDescription(
    `started <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
      `**${itemAmount.toLocaleString()}x** ${items[itemId].emoji} ${items[itemId].name} for $**${bin.toLocaleString()}**`
  );

  if (itemAmount > 1 && bin > 69_420) {
    embed.setFooter({ text: `$${Math.floor(bin / itemAmount).toLocaleString()} per ${items[itemId].name}` });
  }

  const button = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
  );

  const clusters = await (member.client as NypsiClient).cluster.broadcastEval(async (client) => {
    const guild = await client.guilds.fetch("747056029795221513");

    if (guild) return (client as NypsiClient).cluster.id;
    return "not-found";
  });

  let cluster: number;

  for (const i of clusters) {
    if (i != "not-found") {
      cluster = i;
      break;
    }
  }

  const { messageId, messageUrl } = await (member.client as NypsiClient).cluster
    .broadcastEval(
      async (client, { embed, row, cluster }) => {
        if ((client as NypsiClient).cluster.id != cluster) return;
        const guild = await client.guilds.fetch("747056029795221513");

        if (!guild) return;

        const channel = await guild.channels.fetch("1008467335973179482");

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.send({ embeds: [embed], components: [row] });

          return { messageId: msg.id, messageUrl: msg.url };
        }
      },
      { context: { embed: embed.toJSON(), row: button.toJSON(), cluster: cluster } }
    )
    .then((res) => {
      res.filter((i) => Boolean(i));
      return res[0];
    });

  await prisma.auction.create({
    data: {
      bin: bin,
      itemName: itemId,
      messageId: messageId,
      itemAmount: itemAmount,
      ownerId: member.user.id,
    },
  });

  checkWatchers(itemId, messageUrl, member.user.id);

  return messageUrl;
}

export async function bumpAuction(id: string, client: NypsiClient) {
  const query = await prisma.auction.findUnique({
    where: {
      id: id,
    },
    select: {
      messageId: true,
      owner: {
        select: {
          lastKnownTag: true,
        },
      },
      createdAt: true,
      bin: true,
      itemAmount: true,
      itemName: true,
    },
  });

  const embed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setHeader(`${query.owner.lastKnownTag.split("#")[0]}'s auction`);

  const items = getItems();

  embed.setDescription(
    `started <t:${Math.floor(query.createdAt.getTime() / 1000)}:R>\n\n` +
      `**${query.itemAmount.toLocaleString()}x** ${items[query.itemName].emoji} ${
        items[query.itemName].name
      } for $**${query.bin.toLocaleString()}**`
  );

  const button = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
  );

  const messageUrl = await client.cluster
    .broadcastEval(
      async (client, { row, messageId, embed }) => {
        const guild = await client.guilds.fetch("747056029795221513");

        if (!guild) return;

        const channel = await guild.channels.fetch("1008467335973179482");

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.messages.fetch(messageId).catch(() => {});

          if (msg) {
            await msg.delete();
          }

          const m = await channel.send({ embeds: [embed], components: [row] });

          return m.url;
        }
      },
      { context: { messageId: query.messageId, row: button.toJSON(), embed: embed.toJSON() } }
    )
    .then((res) => {
      res.filter((i) => Boolean(i));
      return res[0];
    });

  return messageUrl;
}

export async function getAuctionAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`));

  const auctions = await prisma.auction.findMany({
    where: {
      AND: [{ sold: true }, { itemName: item }],
    },
    select: {
      bin: true,
      itemAmount: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 150,
  });

  const costs: number[] = [];

  for (const auction of auctions) {
    if (costs.length >= 5000) break;

    if (auction.itemAmount > 1) {
      costs.push(Math.floor(Number(auction.bin) / auction.itemAmount));
    } else {
      costs.push(Number(auction.bin));
    }
  }

  const sum = costs.reduce((a, b) => a + b, 0);
  const avg = Math.floor(sum / costs.length) || 0;

  await redis.set(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`, avg);
  await redis.expire(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`, ms("1 hour") / 1000);

  return avg;
}

export async function addToAuctionWatch(member: GuildMember, itemName: string) {
  return await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        auction_watch: { push: itemName },
      },
      select: {
        auction_watch: true,
      },
    })
    .then((q) => q.auction_watch);
}

export async function setAuctionWatch(member: GuildMember, items: string[]) {
  return await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        auction_watch: items,
      },
      select: {
        auction_watch: true,
      },
    })
    .then((q) => q.auction_watch);
}

export async function getAuctionWatch(member: GuildMember) {
  return await prisma.economy
    .findUnique({
      where: {
        userId: member.user.id,
      },
      select: {
        auction_watch: true,
      },
    })
    .then((q) => q.auction_watch);
}

async function checkWatchers(itemName: string, messageUrl: string, creatorId: string) {
  const users = await prisma.economy
    .findMany({
      where: {
        AND: [{ auction_watch: { has: itemName } }, { userId: { not: creatorId } }],
      },
      select: {
        userId: true,
      },
    })
    .then((q) => q.map((q) => q.userId));

  const payload = {
    payload: {
      embed: new CustomEmbed()
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .setDescription(`an auction has started for ${getItems()[itemName].emoji} **${getItems()[itemName].name}**`),
      components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(messageUrl).setLabel("jump")
      ),
    },
    memberId: "boob",
  };

  for (const userId of users) {
    if (!(await getDmSettings(userId)).auction) continue;

    if (await redis.exists(`${Constants.redis.cooldown.AUCTION_WATCH}:${userId}`)) continue;

    payload.memberId = userId;

    await addNotificationToQueue(payload);

    await redis.set(`${Constants.redis.cooldown.AUCTION_WATCH}:${userId}`, "true");
    await redis.expire(`${Constants.redis.cooldown.AUCTION_WATCH}:${userId}`, ms("5 minutes") / 1000);
  }
}
