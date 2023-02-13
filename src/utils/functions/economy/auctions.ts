import { Auction } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  Interaction,
  MessageActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger, transaction } from "../../logger";
import { getTier, isPremium } from "../premium/premium";
import requestDM from "../requestdm";
import { addToNypsiBank, getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getBalance, updateBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");
import dayjs = require("dayjs");

const beingBought = new Set<string>();
const dmQueue = new Map<string, { buyers: Map<string, number> }>();

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

  if (items[itemId].account_locked) return false;

  embed.setDescription(
    `started <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
      `**${itemAmount.toLocaleString()}x** ${items[itemId].emoji} ${items[itemId].name} for $**${bin.toLocaleString()}**`
  );

  if (itemAmount > 1 && bin > 69_420) {
    embed.setFooter({ text: `$${Math.floor(bin / itemAmount).toLocaleString()} per ${items[itemId].name}` });
  }

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
  );

  if (itemAmount > 1)
    buttonRow.addComponents(new ButtonBuilder().setCustomId("b-one").setLabel("buy one").setStyle(ButtonStyle.Secondary));

  const clusters = await (member.client as NypsiClient).cluster.broadcastEval(async (client) => {
    const guild = await client.guilds.fetch("747056029795221513");

    if (guild) return (client as unknown as NypsiClient).cluster.id;
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
        if ((client as unknown as NypsiClient).cluster.id != cluster) return;
        const guild = await client.guilds.fetch("747056029795221513");

        if (!guild) return;

        const channel = await guild.channels.fetch("1008467335973179482");

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.send({ embeds: [embed], components: [row] });

          return { messageId: msg.id, messageUrl: msg.url };
        }
      },
      { context: { embed: embed.toJSON(), row: buttonRow.toJSON(), cluster: cluster } }
    )
    .then((res) => {
      res.filter((i) => Boolean(i));
      return res[0];
    });

  await prisma.auction.create({
    data: {
      bin: bin,
      itemId,
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
      ownerId: true,
      owner: {
        select: {
          user: {
            select: {
              lastKnownTag: true,
            },
          },
        },
      },
      createdAt: true,
      bin: true,
      itemAmount: true,
      itemId: true,
    },
  });

  if (dayjs(query.createdAt).isAfter(dayjs().subtract((await isPremium(query.ownerId)) ? 1 : 12, "hour"))) return null;

  const embed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setHeader(`${query.owner.user.lastKnownTag.split("#")[0]}'s auction`);

  const items = getItems();

  embed.setDescription(
    `started <t:${Math.floor(query.createdAt.getTime() / 1000)}:R>\n\n` +
      `**${query.itemAmount.toLocaleString()}x** ${items[query.itemId].emoji} ${
        items[query.itemId].name
      } for $**${query.bin.toLocaleString()}**`
  );

  if (query.itemAmount > 1 && query.bin > 69_420) {
    embed.setFooter({
      text: `$${Math.floor(Number(query.bin) / query.itemAmount).toLocaleString()} per ${items[query.itemId].name}`,
    });
  }

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
  );

  if (query.itemAmount > 1)
    buttonRow.addComponents(new ButtonBuilder().setCustomId("b-one").setLabel("buy one").setStyle(ButtonStyle.Secondary));

  const clusters = await client.cluster.broadcastEval(async (client) => {
    const guild = await client.guilds.fetch("747056029795221513");

    if (guild) return (client as unknown as NypsiClient).cluster.id;
    return "not-found";
  });

  let cluster: number;

  for (const i of clusters) {
    if (i != "not-found") {
      cluster = i;
      break;
    }
  }

  const [messageUrl, messageId] = await client.cluster
    .broadcastEval(
      async (client, { row, messageId, embed, cluster }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return null;
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

          return [m.url, m.id];
        }
      },
      { context: { messageId: query.messageId, row: buttonRow.toJSON(), embed: embed.toJSON(), cluster } }
    )
    .then((res) => {
      return res.filter((i) => Boolean(i))[0];
    });

  await prisma.auction.update({
    where: {
      id,
    },
    data: {
      messageId,
      createdAt: new Date(),
    },
  });

  return messageUrl;
}

export async function getAuctionAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`));

  const auctions = await prisma.auction.findMany({
    where: {
      AND: [{ sold: true }, { itemId: item }],
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
  await redis.expire(`${Constants.redis.cache.economy.AUCTION_AVG}:${item}`, ms("3 hour") / 1000);

  return avg;
}

export async function addToAuctionWatch(member: GuildMember, itemName: string) {
  return await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        auctionWatch: { push: itemName },
      },
      select: {
        auctionWatch: true,
      },
    })
    .then((q) => q.auctionWatch);
}

export async function setAuctionWatch(member: GuildMember, items: string[]) {
  return await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        auctionWatch: items,
      },
      select: {
        auctionWatch: true,
      },
    })
    .then((q) => q.auctionWatch);
}

export async function getAuctionWatch(member: GuildMember) {
  return await prisma.economy
    .findUnique({
      where: {
        userId: member.user.id,
      },
      select: {
        auctionWatch: true,
      },
    })
    .then((q) => q.auctionWatch);
}

async function checkWatchers(itemName: string, messageUrl: string, creatorId: string) {
  const users = await prisma.economy
    .findMany({
      where: {
        AND: [{ auctionWatch: { has: itemName } }, { userId: { not: creatorId } }],
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

export async function countItemOnAuction(itemId: string) {
  const amount = await prisma.auction.aggregate({
    where: {
      AND: [{ sold: false }, { itemId: itemId }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return amount?._sum?.itemAmount || 0;
}

export async function findAuctions(itemId: string) {
  const query = await prisma.auction.findMany({
    where: {
      AND: [{ sold: false }, { itemId: itemId }],
    },
    orderBy: [{ bin: "asc" }, { createdAt: "asc" }],
    take: 50,
  });

  inPlaceSort(query).asc([(i) => Number(i.bin) / i.itemAmount, (i) => i.createdAt.getTime()]);

  return query;
}

async function showAuctionConfirmation(interaction: ButtonInteraction, cost: number) {
  const modal = new ModalBuilder().setCustomId("auction-confirm").setTitle("confirmation");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel("type 'yes' to confirm")
        .setPlaceholder(`this will cost $${cost.toLocaleString()}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
    )
  );

  await interaction.showModal(modal);

  const filter = (i: Interaction) => i.user.id == interaction.user.id;

  const res = await interaction.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

  if (!res) return;

  if (!res.isModalSubmit()) return;

  if (res.fields.fields.first().value.toLowerCase() != "yes") {
    res.reply({ embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")], ephemeral: true });
    return false;
  }
  return true;
}

export async function buyFullAuction(interaction: ButtonInteraction, auction: Auction) {
  if (beingBought.has(auction.id)) {
    return new Promise((resolve) => {
      logger.debug(`repeating auction buy full - ${auction.itemId} - ${auction.ownerId}`);
      setTimeout(async () => {
        resolve(buyFullAuction(interaction, await prisma.auction.findUnique({ where: { id: auction.id } })));
      }, 75);
    });
  }

  if ((await getBalance(interaction.user.id)) < Number(auction.bin)) {
    return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
  }

  beingBought.add(auction.id);

  setTimeout(() => {
    beingBought.delete(auction.id);
  }, ms("10 minutes"));

  if (auction.bin >= 10_000_000) {
    const modalResponse = await showAuctionConfirmation(interaction, Number(auction.bin));

    if (!modalResponse) return beingBought.delete(auction.id);

    if ((await getBalance(interaction.user.id)) < Number(auction.bin)) {
      beingBought.delete(auction.id);
      return await interaction.followUp({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
    }
  }

  auction = await prisma.auction.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!auction) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
    await interaction.message.delete();
    beingBought.delete(auction.id);
    return;
  }

  if (auction.sold || auction.itemAmount === 0) {
    beingBought.delete(auction.id);
    return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
  }

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  const balance = await getBalance(interaction.user.id);

  if (balance < Number(auction.bin)) {
    beingBought.delete(auction.id);
    return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
  }

  if (Number(auction.bin) < 10_000) {
    await prisma.auction.delete({
      where: {
        id: auction.id,
      },
    });
  } else {
    await prisma.auction
      .update({
        where: {
          id: auction.id,
        },
        data: {
          sold: true,
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if (!(await isPremium(auction.ownerId)) || (await getTier(auction.ownerId)) != 4) {
    taxedAmount = Math.floor(Number(auction.bin) * tax);
    addToNypsiBank(taxedAmount);
  }

  await Promise.all([
    addInventoryItem(interaction.user.id, auction.itemId, auction.itemAmount),
    updateBalance(interaction.user.id, balance - Number(auction.bin)),
    updateBalance(auction.ownerId, (await getBalance(auction.ownerId)) + (Number(auction.bin) - taxedAmount)),
  ]);

  transaction(
    await interaction.client.users.fetch(auction.ownerId),
    interaction.user,
    `${auction.itemId} x ${auction.itemAmount} (auction)`
  );
  transaction(
    interaction.user,
    await interaction.client.users.fetch(auction.ownerId),
    `$${(Number(auction.bin) - taxedAmount).toLocaleString()} (auction)`
  );

  const items = getItems();

  if ((await getDmSettings(auction.ownerId)).auction) {
    if (dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) {
      const buyers = dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers;
      const total = Array.from(buyers.values()).reduce((a, b) => a + b);
      const moneyReceived = Math.floor((Number(auction.bin) / auction.itemAmount) * total);
      let taxedAmount = 0;

      if ((await getTier(auction.ownerId)) != 4) taxedAmount = Math.floor(moneyReceived * tax);

      const embedDm = new CustomEmbed()
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .setDescription(
          `${total.toLocaleString()}x of your ${items[auction.itemId].emoji} ${
            items[auction.itemId].name
          } auction(s) has been bought by: \n${Array.from(buyers.entries())
            .map((i) => `**${i[0]}**: ${i[1]}`)
            .join("\n")}`
        )
        .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
      dmQueue.delete(`${auction.ownerId}-${auction.itemId}`);

      await requestDM({
        client: interaction.client as NypsiClient,
        memberId: auction.ownerId,
        content: `${total.toLocaleString()}x of your auctioned items have been bought`,
        embed: embedDm,
      });
    }

    const embedDm = new CustomEmbed()
      .setColor(Constants.TRANSPARENT_EMBED_COLOR)
      .setDescription(
        `your auction for ${auction.itemAmount}x ${items[auction.itemId].emoji} ${
          items[auction.itemId].name
        } has been bought by ${interaction.user.username} for $**${Math.floor(
          Number(auction.bin) - taxedAmount
        ).toLocaleString()}**${taxedAmount != 0 ? `(${(tax * 100).toFixed(1)}% tax)` : ""} `
      );

    await requestDM({
      client: interaction.client as NypsiClient,
      memberId: auction.ownerId,
      content: "your auction has been bought",
      embed: embedDm,
    });
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[0] = `**bought** by ${interaction.user.username} <t:${Math.floor(Date.now() / 1000)}:R>`;

  embed.setDescription(desc.join("\n\n"));

  if (embed.data.footer?.text) {
    embed.setFooter({ text: embed.data.footer.text });
  }

  beingBought.delete(auction.id);
  await interaction.deferUpdate().catch(() => {});
  await interaction.message.edit({ embeds: [embed], components: [] });
}

export async function buyAuctionOne(interaction: ButtonInteraction, auction: Auction) {
  if (beingBought.has(auction.id)) {
    return new Promise((resolve) => {
      logger.debug(`repeating auction buy one - ${auction.itemId} - ${auction.ownerId}`);
      setTimeout(async () => {
        resolve(buyAuctionOne(interaction, await prisma.auction.findUnique({ where: { id: auction.id } })));
      }, 75);
    });
  }

  if (auction.itemAmount === 1) return buyFullAuction(interaction, auction);

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  if ((await getBalance(interaction.user.id)) < Math.floor(Number(auction.bin) / auction.itemAmount)) {
    return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
  }

  beingBought.add(auction.id);

  setTimeout(() => {
    beingBought.delete(auction.id);
  }, ms("10 minutes"));

  auction = await prisma.auction.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!auction) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
    await interaction.message.delete();
    beingBought.delete(auction.id);
    return;
  }

  if (auction.sold || auction.itemAmount === 0) {
    beingBought.delete(auction.id);
    return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
  }

  const balance = await getBalance(interaction.user.id);

  if (balance < Number(auction.bin)) {
    beingBought.delete(auction.id);
    return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
  }

  if (Number(auction.bin) < 10_000 && auction.itemAmount === 1) {
    await prisma.auction.delete({
      where: {
        id: auction.id,
      },
    });
  } else {
    if (Math.floor(Number(auction.bin) / auction.itemAmount) > 10_000) {
      await prisma.auction.create({
        data: {
          sold: true,
          itemId: auction.itemId,
          itemAmount: 1,
          bin: Math.floor(Number(auction.bin) / auction.itemAmount),
          messageId: randomUUID(),
          ownerId: auction.ownerId,
        },
      });
    }

    await prisma.auction
      .update({
        where: {
          id: auction.id,
        },
        data: {
          itemAmount: { decrement: 1 },
          bin: { decrement: Math.floor(Number(auction.bin) / auction.itemAmount) },
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if (!(await isPremium(auction.ownerId)) || (await getTier(auction.ownerId)) != 4) {
    taxedAmount = Math.floor(Math.floor(Number(auction.bin) / auction.itemAmount) * tax);
    addToNypsiBank(taxedAmount);
  }

  await Promise.all([
    addInventoryItem(interaction.user.id, auction.itemId, 1),
    updateBalance(interaction.user.id, balance - Math.floor(Number(auction.bin) / auction.itemAmount)),
    updateBalance(
      auction.ownerId,
      (await getBalance(auction.ownerId)) + (Math.floor(Number(auction.bin) / auction.itemAmount) - taxedAmount)
    ),
  ]);

  transaction(await interaction.client.users.fetch(auction.ownerId), interaction.user, `${auction.itemId} x ${1} (auction)`);
  transaction(
    interaction.user,
    await interaction.client.users.fetch(auction.ownerId),
    `$${(Math.floor(Number(auction.bin) / auction.itemAmount) - taxedAmount).toLocaleString()} (auction)`
  );

  const items = getItems();

  if ((await getDmSettings(auction.ownerId)).auction) {
    if (dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) {
      if (dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers.has(interaction.user.tag)) {
        dmQueue
          .get(`${auction.ownerId}-${auction.itemId}`)
          .buyers.set(
            interaction.user.tag,
            dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers.get(interaction.user.tag) + 1
          );
      } else {
        dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers.set(interaction.user.tag, 1);
      }
    } else {
      dmQueue.set(`${auction.ownerId}-${auction.itemId}`, {
        buyers: new Map([[interaction.user.tag, 1]]),
      });

      setTimeout(async () => {
        if (!dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) return;
        const buyers = dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers;
        const total = Array.from(buyers.values()).reduce((a, b) => a + b);
        const moneyReceived = Math.floor((Number(auction.bin) / auction.itemAmount) * total);
        let taxedAmount = 0;

        if ((await getTier(auction.ownerId)) != 4) taxedAmount = Math.floor(moneyReceived * tax);

        const embedDm = new CustomEmbed()
          .setColor(Constants.TRANSPARENT_EMBED_COLOR)
          .setDescription(
            `${total.toLocaleString()}x of your ${items[auction.itemId].emoji} ${
              items[auction.itemId].name
            } auction(s) has been bought by: \n${Array.from(buyers.entries())
              .map((i) => `**${i[0]}**: ${i[1]}`)
              .join("\n")}`
          )
          .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
        dmQueue.delete(`${auction.ownerId}-${auction.itemId}`);

        await requestDM({
          client: interaction.client as NypsiClient,
          memberId: auction.ownerId,
          content: `${total.toLocaleString()}x of your auctioned items have been bought`,
          embed: embedDm,
        });
      }, ms("10 minutes"));
    }
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[1] = `**${(auction.itemAmount - 1).toLocaleString()}x** ${items[auction.itemId].emoji} ${
    items[auction.itemId].name
  } for $**${Math.floor(Number(auction.bin) - Math.floor(Number(auction.bin) / auction.itemAmount)).toLocaleString()}**`;

  embed.setDescription(desc.join("\n\n"));

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success)
  );

  if (auction.itemAmount > 2) {
    buttonRow.addComponents(new ButtonBuilder().setCustomId("b-one").setLabel("buy one").setStyle(ButtonStyle.Secondary));
    embed.setFooter({
      text: `$${Math.floor(Number(auction.bin) / auction.itemAmount).toLocaleString()} per ${items[auction.itemId].name}`,
    });
  }

  beingBought.delete(auction.id);
  await interaction.deferUpdate().catch(() => {});
  await interaction.message.edit({ embeds: [embed], components: [buttonRow] });
}
