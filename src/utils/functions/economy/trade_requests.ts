import { TradeRequest } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger, transactionMulti } from "../../logger";
import { getAllGroupAccountIds } from "../moderation/alts";
import { getTier, isPremium } from "../premium/premium";
import { addToNypsiBank, getTax } from "../tax";
import { addBalance } from "./balance";
import { addInventoryItem, getInventory, setInventoryItem } from "./inventory";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");
import dayjs = require("dayjs");
import { Item } from "../../../types/Economy";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";

const beingFulfilled = new Set<number>();

export async function getTradeRequests(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.tradeRequest.findMany({
    where: {
      AND: [{ ownerId: id }, { completed: false }],
    },
  });

  return query;
}

export async function getTradeRequestByMessage(id: string) {
  const tradeRequest = await prisma.tradeRequest.findUnique({
    where: {
      messageId: id,
    },
  });

  return tradeRequest;
}

export async function deleteTradeRequest(id: number, client: NypsiClient, repeatCount = 1) {
  if (
    beingFulfilled.has(id) ||
    (await redis.exists(`${Constants.redis.nypsi.TRADE_FULFILLING}:${id}`))
  ) {
    return new Promise((resolve) => {
      logger.debug(`repeating trade request delete - ${id}`);
      setTimeout(async () => {
        if (repeatCount > 100) {
          beingFulfilled.delete(id);
          await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${id}`);
        }
        resolve(deleteTradeRequest(id, client, repeatCount + 1));
      }, 1000);
    });
  }

  const tradeRequest = await prisma.tradeRequest
    .findFirst({
      where: {
        AND: [{ id: id }, { completed: false }],
      },
      select: {
        messageId: true,
      },
    })
    .catch(() => {});

  if (tradeRequest) {
    await prisma.tradeRequest.delete({
      where: {
        messageId: tradeRequest.messageId,
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
          channelId: Constants.REQUESTS_CHANNEL_ID,
          id: tradeRequest.messageId,
        },
      },
    );
  }

  return Boolean(tradeRequest);
}

export async function createTradeRequest(
  member: GuildMember,
  requestedItems: { item: Item; amount: number }[],
  offeredItems: { item: Item; amount: number }[],
  offeredMoney: number,
) {
  const embed = new CustomEmbed(member).setHeader(
    `${member.user.username}'s trade request`,
    member.user.avatarURL(),
  );

  embed.setDescription(`started <t:${Math.floor(Date.now() / 1000)}:R>\n\n`);

  embed.setFields(
    {
      name: "requesting",
      value: `${requestedItems.length > 0 ? requestedItems.map((item) => `**${item.amount.toLocaleString()}x** ${item.item.emoji} [${item.item.name}](https://nypsi.xyz/item/${item.item.id})`).join("\n") : "none"}`,
      inline: false,
    },
    {
      name: "offering",
      value: `${offeredMoney > 0 ? `$${offeredMoney.toLocaleString()}` : ""}\n${offeredItems.map((item) => `**${item.amount.toLocaleString()}x** ${item.item.emoji} [${item.item.name}](https://nypsi.xyz/item/${item.item.id})`).join("\n")}`,
      inline: false,
    },
  );

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("fr")
      .setLabel("fulfill trade request")
      .setStyle(ButtonStyle.Success),
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
          channelId: Constants.REQUESTS_CHANNEL_ID,
          embed: embed.toJSON(),
          row: buttonRow.toJSON(),
          cluster: cluster,
        },
      },
    )
    .then((res) => {
      return res.filter((i) => Boolean(i))[0];
    });

  await prisma.tradeRequest.create({
    data: {
      requestedItems: requestedItems.map((i) => `${i.item.id}:${i.amount}`),
      offeredItems: offeredItems.map((i) => `${i.item.id}:${i.amount}`),
      offeredMoney: BigInt(offeredMoney),
      messageId: id,
      ownerId: member.user.id,
    },
  });

  return url;
}

export async function bumpTradeRequest(id: number, client: NypsiClient) {
  const query = await prisma.tradeRequest.findUnique({
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
      requestedItems: true,
      offeredItems: true,
      offeredMoney: true,
    },
  });

  if (
    dayjs(query.createdAt).isAfter(
      dayjs().subtract((await isPremium(query.ownerId)) ? 1 : 12, "hour"),
    )
  )
    return null;

  const embed = new CustomEmbed(query.ownerId).setHeader(
    `${query.owner.user.lastKnownUsername}'s trade request`,
  );

  const items = getItems();

  embed.setDescription(`started <t:${Math.floor(Date.now() / 1000)}:R>\n\n`);

  embed.setFields(
    {
      name: "requesting",
      value: `${query.requestedItems.length > 0 ? query.requestedItems.map((item) => `**${parseInt(item.split(":")[1]).toLocaleString()}x** ${items[item.split(":")[0]].emoji} [${items[item.split(":")[0]].name}](https://nypsi.xyz/item/${item.split(":")[0]})`).join("\n") : "none"}`,
      inline: false,
    },
    {
      name: "offering",
      value: `${query.offeredMoney > 0 ? `$${query.offeredMoney.toLocaleString()}` : ""}\n${query.offeredItems.map((item) => `**${parseInt(item.split(":")[1]).toLocaleString()}x** ${items[item.split(":")[0]].emoji} [${items[item.split(":")[0]].name}](https://nypsi.xyz/item/${item.split(":")[0]})`).join("\n")}`,
      inline: false,
    },
  );

  const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("fr")
      .setLabel("fulfill trade request")
      .setStyle(ButtonStyle.Success),
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
          channelId: Constants.REQUESTS_CHANNEL_ID,
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

  await prisma.tradeRequest.update({
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

export async function fulfillTradeRequest(
  interaction: ButtonInteraction,
  tradeRequest: TradeRequest,
  repeatCount = 1,
) {
  if (beingFulfilled.has(tradeRequest.id)) {
    return new Promise((resolve) => {
      logger.debug(`repeating fulfill trade request - ${tradeRequest.ownerId}`);
      setTimeout(async () => {
        if (repeatCount > 100) beingFulfilled.delete(tradeRequest.id);
        resolve(
          fulfillTradeRequest(
            interaction,
            await prisma.tradeRequest.findUnique({ where: { id: tradeRequest.id } }),
            repeatCount + 1,
          ),
        );
      }, 500);
    });
  }

  beingFulfilled.add(tradeRequest.id);
  await redis.set(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`, "d", "EX", 600);
  setTimeout(() => {
    beingFulfilled.delete(tradeRequest.id);
  }, ms("5 minutes"));

  if (interaction.createdTimestamp < Date.now() - 5000) {
    beingFulfilled.delete(tradeRequest.id);
    await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`);
    return;
  }

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  tradeRequest = await prisma.tradeRequest.findFirst({
    where: {
      AND: [{ messageId: interaction.message.id }],
    },
  });

  if (!tradeRequest) {
    await interaction.reply({ embeds: [new ErrorEmbed("invalid trade request")], ephemeral: true });
    await interaction.message.delete();
    beingFulfilled.delete(tradeRequest.id);
    await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`);
    return;
  }

  if (tradeRequest.completed) {
    beingFulfilled.delete(tradeRequest.id);
    await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`);
    return await interaction.reply({
      embeds: [new ErrorEmbed("too slow ):").removeTitle()],
      ephemeral: true,
    });
  }

  if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

  const inventory = await getInventory(interaction.user.id);

  const items = getItems();

  for (const item of tradeRequest.requestedItems) {
    if (
      !inventory.find((i) => i.item == item.split(":")[0]) ||
      inventory.find((i) => i.item == item.split(":")[0]).amount < parseInt(item.split(":")[1])
    ) {
      beingFulfilled.delete(tradeRequest.id);
      await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`);
      return await interaction.reply({
        embeds: [new ErrorEmbed("you do not have the required items")],
        ephemeral: true,
      });
    }
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, tradeRequest.ownerId);

  if (accounts.includes(interaction.user.id)) {
    await prisma.tradeRequest.delete({
      where: {
        id: tradeRequest.id,
      },
    });
  } else {
    await prisma.tradeRequest
      .update({
        where: {
          id: tradeRequest.id,
        },
        data: {
          completed: true,
          createdAt: new Date(),
        },
      })
      .catch(() => {});
  }

  const tax = await getTax();

  let taxedAmount = 0;

  if ((await getTier(tradeRequest.ownerId)) !== 4) {
    taxedAmount = Math.floor(Number(tradeRequest.offeredMoney) * tax);
    addToNypsiBank(taxedAmount);
  }

  const fulfillerInventory = await getInventory(interaction.user.id);

  for (const item of tradeRequest.requestedItems) {
    const itemId = item.split(":")[0];
    const amount = parseInt(item.split(":")[1]);

    await setInventoryItem(
      interaction.user.id,
      itemId,
      fulfillerInventory.find((i) => i.item == itemId).amount - amount,
    );
    await addInventoryItem(tradeRequest.ownerId, itemId, amount);
  }

  for (const item of tradeRequest.offeredItems) {
    const itemId = item.split(":")[0];
    const amount = parseInt(item.split(":")[1]);

    await addInventoryItem(interaction.user.id, itemId, amount);
  }

  if (tradeRequest.offeredMoney > 0) {
    await addBalance(interaction.user.id, Number(tradeRequest.offeredMoney) - taxedAmount);
  }

  logger.info(`trade request fulfilled owner: ${tradeRequest.ownerId} to: ${interaction.user.id}`);

  const formattedRequested: string[] = [];
  const formattedOffered: string[] = [];

  for (const item of tradeRequest.requestedItems) {
    formattedRequested.push(item.replace(":", " x "));
  }

  formattedRequested[formattedRequested.length - 1] =
    `${formattedRequested[formattedRequested.length - 1]} (trade request)`;

  if (tradeRequest.offeredMoney > 0) {
    formattedOffered.push(`$${(Number(tradeRequest.offeredMoney) - taxedAmount).toLocaleString()}`);
  }

  for (const item of tradeRequest.offeredItems) {
    formattedOffered.push(item.replace(":", " x "));
  }

  formattedOffered[formattedOffered.length - 1] =
    `${formattedOffered[formattedOffered.length - 1]} (trade request)`;

  transactionMulti(
    await interaction.client.users.fetch(tradeRequest.ownerId),
    interaction.user,
    formattedOffered,
  );
  transactionMulti(
    interaction.user,
    await interaction.client.users.fetch(tradeRequest.ownerId),
    formattedRequested,
  );

  if ((await getDmSettings(tradeRequest.ownerId)).market) {
    const embedDm = new CustomEmbed(tradeRequest.ownerId).setDescription(
      `your trade request has been fulfilled\n\nyou have received:\n${tradeRequest.requestedItems.map((item) => `- **${parseInt(item.split(":")[1]).toLocaleString()}x** ${items[item.split(":")[0]].emoji} ${items[item.split(":")[0]].name}`).join("\n")}`,
    );

    addNotificationToQueue({
      memberId: tradeRequest.ownerId,
      payload: {
        content: `your trade request has been fulfilled`,
        embed: embedDm,
      },
    });
  }

  const embed = new EmbedBuilder(interaction.message.embeds[0].data);

  const desc = embed.data.description.split("\n\n");

  desc[0] = `**fulfilled** by ${interaction.user.username} <t:${Math.floor(Date.now() / 1000)}:R>`;

  embed.setDescription(desc.join("\n\n"));

  if (embed.data.footer?.text) {
    embed.setFooter({ text: embed.data.footer.text });
  }

  await redis.del(`${Constants.redis.nypsi.TRADE_FULFILLING}:${tradeRequest.id}`);
  beingFulfilled.delete(tradeRequest.id);
  await interaction
    .update({ embeds: [embed], components: [] })
    .catch(() => interaction.message.edit({ embeds: [embed], components: [] }));
}
