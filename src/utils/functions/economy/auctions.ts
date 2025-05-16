import { Auction, AuctionWatch } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, ErrorEmbed, getColor } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger, transaction } from "../../logger";
import { getAllGroupAccountIds } from "../moderation/alts";
import { filterOutliers } from "../outliers";
import { getTier, isPremium } from "../premium/premium";
import { addToNypsiBank, getTax } from "../tax";
import { addNotificationToQueue, getDmSettings, getPreferences } from "../users/notifications";
import itemHistoryWorker from "../workers/itemhistory";
import { addBalance, getBalance, removeBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");
import dayjs = require("dayjs");

const beingBought = new Set<number>();
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

export async function deleteAuction(id: number, client: NypsiClient, repeatCount = 1) {
  if (
    beingBought.has(id) ||
    (await redis.exists(`${Constants.redis.nypsi.auction_buying}:${id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating auction delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          beingBought.delete(id);
          await redis.del(`${Constants.redis.nypsi.auction_buying}:${id}`);
        }
        resolve(deleteAuction(id, client, repeatCount + 1));
      }, 1000);
    });
  }

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
      async (client, { guildId, channelId, id }) => {
        const guild = await client.guilds.cache.get(guildId);

        if (!guild) return;

        const channel = await guild.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.messages.fetch(id).catch(() => {});

          if (msg) await msg.delete().catch(() => {});
        }
      },
      {
        context: {
          guildId: Constants.NYPSI_SERVER_ID,
          channelId: Constants.AUCTION_CHANNEL_ID,
          id: auction.messageId,
        },
      },
    );
  }

  return Boolean(auction);
}

export async function createAuction(
  member: GuildMember,
  itemId: string,
  itemAmount: number,
  bin: number,
) {
  const embed = new CustomEmbed(member).setHeader(
    `${member.user.username}'s auction`,
    member.user.avatarURL(),
  );

  const items = getItems();

  if (items[itemId].account_locked) return false;

  embed.setDescription(
    `started <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
      `**${itemAmount.toLocaleString()}x** ${items[itemId].emoji} **[${
        items[itemId].name
      }](https://nypsi.xyz/item/${itemId})** for $**${bin.toLocaleString()}**`,
  );

  if (itemAmount > 1 && bin > 69_420) {
    embed.setFooter({
      text: `$${Math.floor(bin / itemAmount).toLocaleString()} per ${items[itemId].name}`,
    });
  }

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success),
  );

  if (itemAmount >= 10)
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId("b-multi")
        .setLabel("buy multiple")
        .setStyle(ButtonStyle.Secondary),
    );
  else if (itemAmount > 1)
    buttonRow.addComponents(
      new ButtonBuilder().setCustomId("b-one").setLabel("buy one").setStyle(ButtonStyle.Secondary),
    );

  const clusters = await (member.client as NypsiClient).cluster.broadcastEval(
    async (client, { guildId }) => {
      const guild = await client.guilds.cache.get(guildId);

      if (guild) return (client as unknown as NypsiClient).cluster.id;
      return "not-found";
    },
    { context: { guildId: Constants.NYPSI_SERVER_ID } },
  );

  let cluster: number;

  for (const i of clusters) {
    if (i != "not-found") {
      cluster = i;
      break;
    }
  }

  const { url, id } = await (member.client as NypsiClient).cluster
    .broadcastEval(
      async (client, { guildId, channelId, embed, row, cluster }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return;
        const guild = await client.guilds.cache.get(guildId);

        if (!guild) return;

        const channel = await guild.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.send({ embeds: [embed], components: [row] });

          return { url: msg.url, id: msg.id };
        }
      },
      {
        context: {
          guildId: Constants.NYPSI_SERVER_ID,
          channelId: Constants.AUCTION_CHANNEL_ID,
          embed: embed.toJSON(),
          row: buttonRow.toJSON(),
          cluster: cluster,
        },
      },
    )
    .then((res) => {
      return res.filter((i) => Boolean(i))[0];
    });

  await prisma.auction.create({
    data: {
      bin: bin,
      itemId,
      messageId: id,
      itemAmount: itemAmount,
      ownerId: member.user.id,
    },
  });

  checkWatchers(itemId, url, member.user.id, bin / itemAmount);

  return url;
}

export async function bumpAuction(id: number, client: NypsiClient) {
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
              lastKnownUsername: true,
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

  if (
    dayjs(query.createdAt).isAfter(
      dayjs().subtract((await isPremium(query.ownerId)) ? 1 : 12, "hour"),
    )
  )
    return null;

  const embed = new CustomEmbed(query.ownerId).setHeader(
    `${query.owner.user.lastKnownUsername}'s auction`,
  );

  const items = getItems();

  embed.setDescription(
    `started <t:${Math.floor(query.createdAt.getTime() / 1000)}:R>\n\n` +
      `**${query.itemAmount.toLocaleString()}x** ${items[query.itemId].emoji} **[${
        items[query.itemId].name
      }](https://nypsi.xyz/item/${query.itemId})** for $**${query.bin.toLocaleString()}**`,
  );

  if (query.itemAmount > 1 && query.bin > 69_420) {
    embed.setFooter({
      text: `$${Math.floor(Number(query.bin / query.itemAmount)).toLocaleString()} per ${
        items[query.itemId].name
      }`,
    });
  }

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success),
  );

  if (query.itemAmount >= 10)
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId("b-multi")
        .setLabel("buy multiple")
        .setStyle(ButtonStyle.Secondary),
    );
  else if (query.itemAmount > 1)
    buttonRow.addComponents(
      new ButtonBuilder().setCustomId("b-one").setLabel("buy one").setStyle(ButtonStyle.Secondary),
    );

  const clusters = await client.cluster.broadcastEval(
    async (client, { serverId }) => {
      const guild = await client.guilds.cache.get(serverId);

      if (guild) return (client as unknown as NypsiClient).cluster.id;
      return "not-found";
    },
    { context: { serverId: Constants.NYPSI_SERVER_ID } },
  );

  let cluster: number;

  for (const i of clusters) {
    if (i != "not-found") {
      cluster = i;
      break;
    }
  }

  const [messageUrl, messageId] = await client.cluster
    .broadcastEval(
      async (client, { guildId, channelId, row, messageId, embed, cluster }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return null;
        const guild = await client.guilds.cache.get(guildId);

        if (!guild) return;

        const channel = await guild.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased()) {
          const msg = await channel.messages.fetch(messageId).catch(() => {});

          if (msg) {
            await msg.delete();

            embed.author = msg.embeds[0]?.author;
            embed.color = msg.embeds[0]?.color;
          }

          const m = await channel.send({ embeds: [embed], components: [row] });

          return [m.url, m.id];
        }
      },
      {
        context: {
          guildId: Constants.NYPSI_SERVER_ID,
          channelId: Constants.AUCTION_CHANNEL_ID,
          messageId: query.messageId,
          row: buttonRow.toJSON(),
          embed: embed.toJSON(),
          cluster,
        },
      },
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

  checkWatchers(
    query.itemId,
    messageUrl,
    query.ownerId,
    Math.floor(Number(query.bin / query.itemAmount)),
  );

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
    take: 50,
  });

  const costs: number[] = [];

  for (const auction of auctions) {
    if (costs.length >= 500) break;

    if (auction.itemAmount > 1) {
      costs.push(Math.floor(Number(auction.bin / auction.itemAmount)));
    } else {
      costs.push(Number(auction.bin));
    }
  }

  let filtered = filterOutliers(costs);

  if (!filtered) {
    logger.warn("failed to filter outliers (auctions)", { costs, item, auctions });
    filtered = costs;
  }

  const sum = filtered.reduce((a, b) => a + b, 0);
  const avg = Math.floor(sum / filtered.length) || 0;

  await redis.set(
    `${Constants.redis.cache.economy.AUCTION_AVG}:${item}`,
    avg,
    "EX",
    ms("3 hour") / 1000,
  );

  return avg;
}

export async function updateAuctionWatch(member: GuildMember, itemName: string, itemCost?: number) {
  await prisma.auctionWatch.upsert({
    where: {
      userId_itemId: {
        userId: member.user.id,
        itemId: itemName,
      },
    },
    update: {
      itemId: itemName,
      maxCost: itemCost,
    },
    create: {
      userId: member.user.id,
      itemId: itemName,
      maxCost: itemCost,
    },
  });

  return getAuctionWatch(member);
}

export async function setAuctionWatch(member: GuildMember, items: AuctionWatch[]) {
  await prisma.auctionWatch.deleteMany({ where: { userId: member.user.id } });

  await prisma.auctionWatch.createMany({ data: items });
  return items;
}

export async function deleteAuctionWatch(member: GuildMember, itemId: string) {
  await prisma.auctionWatch.delete({
    where: {
      userId_itemId: {
        userId: member.user.id,
        itemId: itemId,
      },
    },
  });

  return getAuctionWatch(member);
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

async function checkWatchers(
  itemName: string,
  messageUrl: string,
  creatorId: string,
  cost: number,
) {
  const users = await prisma.auctionWatch
    .findMany({
      where: {
        AND: [
          { itemId: itemName },
          { userId: { not: creatorId } },
          { OR: [{ maxCost: { gte: Math.floor(cost) } }, { maxCost: 0 }] },
        ],
      },
      select: {
        userId: true,
      },
    })
    .then((q) => q.map((i) => i.userId));

  const payload = {
    payload: {
      embed: new CustomEmbed().setDescription(
        `an auction has started for ${getItems()[itemName].emoji} **[${
          getItems()[itemName].name
        }](https://nypsi.xyz/item/${itemName})**`,
      ),
      components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(messageUrl).setLabel("jump"),
      ),
    },
    memberId: "boob",
  };

  for (const userId of users) {
    if (!(await getDmSettings(userId)).auction) continue;

    if (await redis.exists(`${Constants.redis.cooldown.AUCTION_WATCH}:${userId}`)) continue;

    payload.memberId = userId;
    payload.payload.embed.setColor(getColor(userId));

    addNotificationToQueue(payload);

    await redis.set(`${Constants.redis.cooldown.AUCTION_WATCH}:${userId}`, "true", "EX", 300);
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

  inPlaceSort(query).asc([(i) => Number(i.bin / i.itemAmount), (i) => i.createdAt.getTime()]);

  return query;
}

async function showAuctionConfirmation(interaction: ButtonInteraction, cost: number) {
  const id = `auction-confirm-${Math.floor(Math.random() * 69420)}`;

  const modal = new ModalBuilder().setCustomId(id).setTitle("confirmation");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel("type 'yes' to confirm")
        .setPlaceholder(`this will cost $${cost.toLocaleString()}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3),
    ),
  );

  await interaction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.user.id == interaction.user.id && i.customId === id;

  const res = await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});

  if (!res) return;

  if (!res.isModalSubmit()) return;

  if (res.fields.fields.first().value.toLowerCase() != "yes") {
    res.reply({
      embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  res.reply({ embeds: [new CustomEmbed(null, "✅ confirmation accepted")], flags: MessageFlags.Ephemeral });

  return true;
}

export async function buyFullAuction(
  interaction: ButtonInteraction,
  auction: Auction,
  repeatCount = 1,
) {
  if (beingBought.has(auction.id)) {
    return new Promise((resolve) => {
      logger.debug(`repeating auction buy full - ${auction.itemId} - ${auction.ownerId}`);
      setTimeout(async () => {
        if (repeatCount > 100) beingBought.delete(auction.id);
        resolve(
          buyFullAuction(
            interaction,
            await prisma.auction.findUnique({ where: { id: auction.id } }),
            repeatCount + 1,
          ),
        );
      }, 500);
    });
  }

  beingBought.add(auction.id);
  await redis.set(`${Constants.redis.nypsi.auction_buying}:${auction.id}`, "d", "EX", 600);
  setTimeout(() => {
    beingBought.delete(auction.id);
  }, ms("5 minutes"));

  if (interaction.createdTimestamp < Date.now() - 5000) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return;
  }

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  if ((await getBalance(interaction.user.id)) < Number(auction.bin)) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const preferences = await getPreferences(interaction.user.id);

  if (auction.bin >= preferences.auctionConfirm && Number(preferences.auctionConfirm) !== 0) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    const modalResponse = await showAuctionConfirmation(interaction, Number(auction.bin)).catch(
      () => {},
    );
    if (beingBought.has(auction.id)) return;
    beingBought.add(auction.id);
    await redis.set(`${Constants.redis.nypsi.auction_buying}:${auction.id}`, "d", "EX", 600);

    if (!modalResponse) {
      beingBought.delete(auction.id);
      await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
      return;
    }

    if ((await getBalance(interaction.user.id)) < Number(auction.bin)) {
      beingBought.delete(auction.id);
      await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
      return await interaction.followUp({
        embeds: [new ErrorEmbed("you cannot afford this")],
        flags: MessageFlags.Ephemeral,
      });
    }
    beingBought.add(auction.id);
    await redis.set(`${Constants.redis.nypsi.auction_buying}:${auction.id}`, "d", "EX", 600);
  }

  auction = await prisma.auction.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!auction) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], flags: MessageFlags.Ephemeral });
    await interaction.message.delete();
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return;
  }

  if (auction.sold || Number(auction.itemAmount) === 0) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("too slow ):").removeTitle()],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  const balance = await getBalance(interaction.user.id);

  if (balance < Number(auction.bin)) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, auction.ownerId);

  if (Number(auction.bin / auction.itemAmount) < 50_000 || accounts.includes(interaction.user.id)) {
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
          createdAt: new Date(),
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if ((await getTier(auction.ownerId)) !== 4) {
    taxedAmount = Math.floor(Number(auction.bin) * tax);
    addToNypsiBank(taxedAmount);
  }

  await Promise.all([
    addInventoryItem(interaction.user.id, auction.itemId, Number(auction.itemAmount)),
    removeBalance(interaction.user.id, Number(auction.bin)),
    addBalance(auction.ownerId, Number(auction.bin) - taxedAmount),
    addStat(auction.ownerId, "earned-auctions", Number(auction.bin) - taxedAmount),
    addStat(interaction.user.id, "spent-auctions", Number(auction.bin) - taxedAmount),
  ]);

  logger.info(
    `auction full sold owner: ${auction.ownerId} - ${auction.itemId} to ${interaction.user.id}`,
  );

  transaction(
    await interaction.client.users.fetch(auction.ownerId),
    interaction.user,
    `${auction.itemId} x ${auction.itemAmount} (auction)`,
  );
  transaction(
    interaction.user,
    await interaction.client.users.fetch(auction.ownerId),
    `$${(Number(auction.bin) - taxedAmount).toLocaleString()} (auction)`,
  );

  const items = getItems();

  if ((await getDmSettings(auction.ownerId)).auction) {
    if (dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) {
      const buyers = dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers;
      const total = Array.from(buyers.values()).reduce((a, b) => a + b);
      const moneyReceived = Math.floor(Number(auction.bin / auction.itemAmount) * total);
      let taxedAmount = 0;

      if ((await getTier(auction.ownerId)) !== 4) taxedAmount = Math.floor(moneyReceived * tax);

      const embedDm = new CustomEmbed(auction.ownerId)
        .setDescription(
          `${total.toLocaleString()}x of your ${items[auction.itemId].emoji} ${
            items[auction.itemId].name
          } auction(s) has been bought by: \n${Array.from(buyers.entries())
            .map((i) => `**${i[0]}**: ${i[1]}`)
            .join("\n")}`,
        )
        .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
      dmQueue.delete(`${auction.ownerId}-${auction.itemId}`);

      addNotificationToQueue({
        memberId: auction.ownerId,
        payload: {
          content: `${total.toLocaleString()}x of your auctioned items have been bought`,
          embed: embedDm,
        },
      });
    }

    const embedDm = new CustomEmbed()
      .setColor(Constants.EMBED_SUCCESS_COLOR)
      .setDescription(
        `your auction for ${auction.itemAmount}x ${items[auction.itemId].emoji} ${
          items[auction.itemId].name
        } has been bought by ${interaction.user.username} for $**${Math.floor(
          Number(auction.bin) - taxedAmount,
        ).toLocaleString()}**${taxedAmount != 0 ? `(${(tax * 100).toFixed(1)}% tax)` : ""} `,
      );

    addNotificationToQueue({
      memberId: auction.ownerId,
      payload: {
        content: "your auction has been bought",
        embed: embedDm,
      },
    });
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[0] = `**bought** by ${interaction.user.username} <t:${Math.floor(Date.now() / 1000)}:R>`;

  embed.setDescription(desc.join("\n\n"));

  if (embed.data.footer?.text) {
    embed.setFooter({ text: embed.data.footer.text });
  }

  await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
  beingBought.delete(auction.id);
  await interaction
    .update({ embeds: [embed], components: [] })
    .catch(() => interaction.message.edit({ embeds: [embed], components: [] }));
}

export async function buyAuctionOne(
  interaction: ButtonInteraction,
  auction: Auction,
  repeatCount = 1,
) {
  if (beingBought.has(auction.id)) {
    return new Promise((resolve) => {
      logger.debug(`repeating auction buy one - ${auction.itemId} - ${auction.ownerId}`);
      setTimeout(async () => {
        if (repeatCount > 100) beingBought.delete(auction.id);
        resolve(
          buyAuctionOne(
            interaction,
            await prisma.auction.findUnique({ where: { id: auction.id } }),
            repeatCount + 1,
          ),
        );
      }, 500);
    });
  }

  if (interaction.createdTimestamp < Date.now() - 5000) return;

  if (Number(auction.itemAmount) === 1) return buyFullAuction(interaction, auction);

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  if (
    (await getBalance(interaction.user.id)) < Math.floor(Number(auction.bin / auction.itemAmount))
  ) {
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  beingBought.add(auction.id);
  await redis.set(`${Constants.redis.nypsi.auction_buying}:${auction.id}`, "d", "EX", 600);

  setTimeout(() => {
    beingBought.delete(auction.id);
  }, ms("10 minutes"));

  auction = await prisma.auction.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!auction) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], flags: MessageFlags.Ephemeral });
    await interaction.message.delete();
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return;
  }

  if (auction.sold || Number(auction.itemAmount) === 0) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("too slow ):").removeTitle()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const balance = await getBalance(interaction.user.id);

  if (balance < Math.floor(Number(auction.bin / auction.itemAmount))) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, auction.ownerId);

  if (
    (Number(auction.bin) < 10_000 && Number(auction.itemAmount) === 1) ||
    accounts.includes(interaction.user.id)
  ) {
    await prisma.auction.delete({
      where: {
        id: auction.id,
      },
    });
  } else {
    if (Math.floor(Number(auction.bin / auction.itemAmount)) > 10_000) {
      await prisma.auction.create({
        data: {
          sold: true,
          itemId: auction.itemId,
          itemAmount: 1,
          bin: Math.floor(Number(auction.bin / auction.itemAmount)),
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
          bin: { decrement: Math.floor(Number(auction.bin / auction.itemAmount)) },
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if (
    (await getTier(auction.ownerId)) !== 4 &&
    Number(auction.bin / auction.itemAmount) >= 1_000_000
  ) {
    taxedAmount = Math.floor(Math.floor(Number(auction.bin / auction.itemAmount)) * tax);
    addToNypsiBank(taxedAmount);
  }

  await Promise.all([
    addInventoryItem(interaction.user.id, auction.itemId, 1),
    removeBalance(interaction.user.id, Math.floor(Number(auction.bin / auction.itemAmount))),
    addBalance(auction.ownerId, Math.floor(Number(auction.bin / auction.itemAmount)) - taxedAmount),
    addStat(
      auction.ownerId,
      "earned-auctions",
      Math.floor(Number(auction.bin / auction.itemAmount)) - taxedAmount,
    ),
    addStat(
      interaction.user.id,
      "spent-auctions",
      Math.floor(Number(auction.bin / auction.itemAmount)) - taxedAmount,
    ),
  ]);

  logger.info(
    `auction one sold owner: ${auction.ownerId} - ${auction.itemId} to ${interaction.user.id}`,
  );

  transaction(
    await interaction.client.users.fetch(auction.ownerId),
    interaction.user,
    `${auction.itemId} x ${1} (auction)`,
  );
  transaction(
    interaction.user,
    await interaction.client.users.fetch(auction.ownerId),
    `$${(
      Math.floor(Number(auction.bin / auction.itemAmount)) - taxedAmount
    ).toLocaleString()} (auction)`,
  );

  const items = getItems();

  if ((await getDmSettings(auction.ownerId)).auction) {
    if (dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) {
      if (
        dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers.has(interaction.user.username)
      ) {
        dmQueue
          .get(`${auction.ownerId}-${auction.itemId}`)
          .buyers.set(
            interaction.user.username,
            dmQueue
              .get(`${auction.ownerId}-${auction.itemId}`)
              .buyers.get(interaction.user.username) + 1,
          );
      } else {
        dmQueue
          .get(`${auction.ownerId}-${auction.itemId}`)
          .buyers.set(interaction.user.username, 1);
      }
    } else {
      dmQueue.set(`${auction.ownerId}-${auction.itemId}`, {
        buyers: new Map([[interaction.user.username, 1]]),
      });

      setTimeout(async () => {
        if (!dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) return;
        const buyers = dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers;
        const total = Array.from(buyers.values()).reduce((a, b) => a + b);
        const moneyReceived = Math.floor(Number(auction.bin / auction.itemAmount) * total);
        let taxedAmount = 0;

        if ((await getTier(auction.ownerId)) !== 4) taxedAmount = Math.floor(moneyReceived * tax);

        const embedDm = new CustomEmbed(auction.ownerId)
          .setDescription(
            `${total.toLocaleString()}x of your ${items[auction.itemId].emoji} ${
              items[auction.itemId].name
            } auction(s) has been bought by: \n${Array.from(buyers.entries())
              .map((i) => `**${i[0]}**: ${i[1]}`)
              .join("\n")}`,
          )
          .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
        dmQueue.delete(`${auction.ownerId}-${auction.itemId}`);

        addNotificationToQueue({
          memberId: auction.ownerId,
          payload: {
            content: `${total.toLocaleString()}x of your auctioned items have been bought`,
            embed: embedDm,
          },
        });
      }, ms("10 minutes"));
    }
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[1] = `**${(Number(auction.itemAmount) - 1).toLocaleString()}x** ${
    items[auction.itemId].emoji
  } **[${items[auction.itemId].name}](https://nypsi.xyz/item/${auction.itemId})** for $**${Math.floor(
    Number(auction.bin) - Math.floor(Number(auction.bin / auction.itemAmount)),
  ).toLocaleString()}**`;

  embed.setDescription(desc.join("\n\n"));

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success),
  );

  if (auction.itemAmount > 2) {
    embed.setFooter({
      text: `$${Math.floor(Number(auction.bin / auction.itemAmount)).toLocaleString()} per ${
        items[auction.itemId].name
      }`,
    });
    if (auction.itemAmount > 10) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId("b-multi")
          .setLabel("buy multiple")
          .setStyle(ButtonStyle.Secondary),
      );
    } else
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId("b-one")
          .setLabel("buy one")
          .setStyle(ButtonStyle.Secondary),
      );
  }

  beingBought.delete(auction.id);
  await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
  await interaction
    .update({ embeds: [embed], components: [buttonRow] })
    .catch(() => interaction.message.edit({ embeds: [embed], components: [buttonRow] }));
}

export async function buyAuctionMulti(
  amount: bigint,
  interaction: ModalSubmitInteraction,
  auction: Auction,
  repeatCount = 1,
) {
  if (beingBought.has(auction.id)) {
    return new Promise((resolve) => {
      logger.debug(
        `repeating auction buy multi (${amount}) - ${auction.itemId} - ${auction.ownerId}`,
      );
      setTimeout(async () => {
        if (repeatCount > 100) beingBought.delete(auction.id);
        resolve(
          buyAuctionMulti(
            amount,
            interaction,
            await prisma.auction.findUnique({ where: { id: auction.id } }),
            repeatCount + 1,
          ),
        );
      }, 50);
    });
  }

  if (interaction.createdTimestamp < Date.now() - 5000) return;

  beingBought.add(auction.id);
  await redis.set(`${Constants.redis.nypsi.auction_buying}:${auction.id}`, "d", "EX", 600);

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  if (
    (await getBalance(interaction.user.id)) <
    Math.floor(Number((auction.bin / auction.itemAmount) * amount))
  ) {
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    beingBought.delete(auction.id);
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  setTimeout(() => {
    beingBought.delete(auction.id);
  }, ms("10 minutes"));

  auction = await prisma.auction.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!auction) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], flags: MessageFlags.Ephemeral });
    await interaction.message.delete();
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return;
  }

  if (auction.sold || Number(auction.itemAmount) === 0) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("too slow ):").removeTitle()],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (amount > auction.itemAmount) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("not enough items")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const balance = await getBalance(interaction.user.id);

  if (balance < Math.floor(Number((auction.bin / auction.itemAmount) * amount))) {
    beingBought.delete(auction.id);
    await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("you cannot afford this")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, auction.ownerId);

  if (
    (Number(auction.bin) < 10_000 && Number(auction.itemAmount) === 1) ||
    accounts.includes(interaction.user.id)
  ) {
    await prisma.auction.delete({
      where: {
        id: auction.id,
      },
    });
  } else {
    if (Math.floor(Number((auction.bin / auction.itemAmount) * amount)) > 10_000) {
      await prisma.auction.create({
        data: {
          sold: true,
          itemId: auction.itemId,
          itemAmount: amount,
          bin: Math.floor(Number((auction.bin / auction.itemAmount) * amount)),
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
          itemAmount: { decrement: amount },
          bin: { decrement: Math.floor(Number((auction.bin / auction.itemAmount) * amount)) },
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if (
    (await getTier(auction.ownerId)) !== 4 &&
    Number((auction.bin / auction.itemAmount) * amount) >= 1_000_000
  ) {
    taxedAmount = Math.floor(Math.floor(Number((auction.bin / auction.itemAmount) * amount)) * tax);
    addToNypsiBank(taxedAmount);
  }

  await Promise.all([
    addInventoryItem(interaction.user.id, auction.itemId, Number(amount)),
    removeBalance(
      interaction.user.id,
      Math.floor(Number((auction.bin / auction.itemAmount) * amount)),
    ),
    addBalance(
      auction.ownerId,
      Math.floor(Number((auction.bin / auction.itemAmount) * amount)) - taxedAmount,
    ),
    addStat(
      auction.ownerId,
      "earned-auctions",
      Math.floor(Number((auction.bin / auction.itemAmount) * amount)) - taxedAmount,
    ),
    addStat(
      interaction.user.id,
      "spent-auctions",
      Math.floor(Number((auction.bin / auction.itemAmount) * amount)) - taxedAmount,
    ),
  ]);

  logger.info(
    `auction multi (${amount}) sold owner: ${auction.ownerId} - ${auction.itemId} to ${interaction.user.id}`,
  );

  transaction(
    await interaction.client.users.fetch(auction.ownerId),
    interaction.user,
    `${auction.itemId} x ${amount} (auction)`,
  );
  transaction(
    interaction.user,
    await interaction.client.users.fetch(auction.ownerId),
    `$${(
      Math.floor(Number((auction.bin / auction.itemAmount) * amount)) - taxedAmount
    ).toLocaleString()} (auction)`,
  );

  const items = getItems();

  if ((await getDmSettings(auction.ownerId)).auction) {
    if (dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) {
      if (
        dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers.has(interaction.user.username)
      ) {
        dmQueue
          .get(`${auction.ownerId}-${auction.itemId}`)
          .buyers.set(
            interaction.user.username,
            dmQueue
              .get(`${auction.ownerId}-${auction.itemId}`)
              .buyers.get(interaction.user.username) + Number(amount),
          );
      } else {
        dmQueue
          .get(`${auction.ownerId}-${auction.itemId}`)
          .buyers.set(interaction.user.username, Number(amount));
      }
    } else {
      dmQueue.set(`${auction.ownerId}-${auction.itemId}`, {
        buyers: new Map([[interaction.user.username, Number(amount)]]),
      });

      setTimeout(async () => {
        if (!dmQueue.has(`${auction.ownerId}-${auction.itemId}`)) return;
        const buyers = dmQueue.get(`${auction.ownerId}-${auction.itemId}`).buyers;
        const total = Array.from(buyers.values()).reduce((a, b) => a + b);
        const moneyReceived = Math.floor(Number(auction.bin / auction.itemAmount) * total);
        let taxedAmount = 0;

        if ((await getTier(auction.ownerId)) !== 4) taxedAmount = Math.floor(moneyReceived * tax);

        const embedDm = new CustomEmbed(auction.ownerId)
          .setDescription(
            `${total.toLocaleString()}x of your ${items[auction.itemId].emoji} ${
              items[auction.itemId].name
            } auction(s) has been bought by: \n${Array.from(buyers.entries())
              .map((i) => `**${i[0]}**: ${i[1]}`)
              .join("\n")}`,
          )
          .setFooter({ text: `+$${(moneyReceived - taxedAmount).toLocaleString()}` });
        dmQueue.delete(`${auction.ownerId}-${auction.itemId}`);

        addNotificationToQueue({
          memberId: auction.ownerId,
          payload: {
            content: `${total.toLocaleString()}x of your auctioned items have been bought`,
            embed: embedDm,
          },
        });
      }, ms("10 minutes"));
    }
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[1] = `**${(Number(auction.itemAmount) - Number(amount)).toLocaleString()}x** ${
    items[auction.itemId].emoji
  } **[${items[auction.itemId].name}](https://nypsi.xyz/item/${auction.itemId})** for $**${Math.floor(
    Number(auction.bin) - Math.floor(Number((auction.bin / auction.itemAmount) * amount)),
  ).toLocaleString()}**`;

  embed.setDescription(desc.join("\n\n"));

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("b").setLabel("buy").setStyle(ButtonStyle.Success),
  );

  if (auction.itemAmount - amount > 1) {
    embed.setFooter({
      text: `$${Math.floor(Number(auction.bin / auction.itemAmount)).toLocaleString()} per ${
        items[auction.itemId].name
      }`,
    });

    if (auction.itemAmount - amount < 10) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId("b-one")
          .setLabel("buy one")
          .setStyle(ButtonStyle.Secondary),
      );
    }
  }

  if (auction.itemAmount - amount >= 10) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId("b-multi")
        .setLabel("buy multiple")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  beingBought.delete(auction.id);
  await redis.del(`${Constants.redis.nypsi.auction_buying}:${auction.id}`);

  await interaction.deferUpdate().catch(() => {});
  await interaction.message.edit({ embeds: [embed], components: [buttonRow] });
}

export async function getItemHistoryGraph(itemId: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.AUCTION_ITEM_GRAPH_DATA}:${itemId}`)) {
    return await redis.get(`${Constants.redis.cache.economy.AUCTION_ITEM_GRAPH_DATA}:${itemId}`);
  }

  const res = await itemHistoryWorker(itemId);

  if (typeof res === "string") {
    await redis.set(
      `${Constants.redis.cache.economy.AUCTION_ITEM_GRAPH_DATA}:${itemId}`,
      res,
      "EX",
      ms("1 day") / 1000,
    );
  }

  return res;
}
