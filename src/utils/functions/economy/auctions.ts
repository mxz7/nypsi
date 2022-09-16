import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, MessageActionRowComponentBuilder } from "discord.js";
import prisma from "../../database/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { getItems } from "./utils";

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
    .delete({
      where: {
        id: id,
      },
      select: {
        messageId: true,
      },
    })
    .catch(() => {});

  if (auction) {
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

  const embed = new CustomEmbed().setColor("#36393f").setHeader(`${query.owner.lastKnownTag.split("#")[0]}'s auction`);

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
