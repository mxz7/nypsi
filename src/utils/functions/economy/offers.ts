import { Offer } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { filterOutliers } from "../outliers";
import { isPremium } from "../premium/premium";
import { getTax } from "../tax";
import { addBalance } from "./balance";
import { getInventory } from "./inventory";
import { createUser, getItems, userExists } from "./utils";
import dayjs = require("dayjs");

export async function createOffer(
  target: User,
  itemId: string,
  itemAmount: number,
  money: number,
  owner: GuildMember,
) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("accept-offer")
      .setLabel("accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("deny-offer").setLabel("deny").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("block-item")
      .setLabel("block item")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("block-user")
      .setLabel("block user")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("disable-offers")
      .setLabel("disable all offers")
      .setStyle(ButtonStyle.Secondary),
  );

  const tax = await getTax();
  let taxedAmount = 0;

  if (!(await isPremium(owner)) && money >= 1_000_000) taxedAmount = Math.floor(money * tax);

  const embed = new CustomEmbed(
    owner,
    `${owner.user.username} offers $**${Math.floor(money - taxedAmount).toLocaleString()}**${
      taxedAmount != 0 ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
    } for your **${itemAmount.toLocaleString()}x** ${getItems()[itemId].emoji} [${
      getItems()[itemId].name
    }](https://nypsi.xyz/item/${itemId})\n\ndo you accept?`,
  ).setHeader(`${owner.user.username}'s offer`, owner.user.avatarURL());

  if (itemAmount > 1 && money > 1000) {
    embed.setFooter({
      text: `$${Math.floor(money / itemAmount).toLocaleString()} per ${getItems()[itemId].name}`,
    });
  }

  const msg = await target
    .send({
      content: `you've received an offer for ${itemAmount.toLocaleString()}x ${
        getItems()[itemId].name
      }`,
      embeds: [embed],
      components: [row],
    })
    .catch(() => {});

  if (!msg) return false;

  await prisma.offer.create({
    data: {
      messageId: msg.id,
      itemId,
      money,
      itemAmount,
      ownerId: owner.id,
      targetId: target.id,
    },
  });

  return true;
}

export async function getOwnedOffers(userId: string) {
  return await prisma.offer.findMany({ where: { AND: [{ ownerId: userId }, { sold: false }] } });
}

export async function getTargetedOffers(userId: string) {
  return await prisma.offer.findMany({ where: { AND: [{ targetId: userId }, { sold: false }] } });
}

export async function getBlockedList(userId: string) {
  if (!(await userExists(userId))) await createUser(userId);

  return await prisma.economy
    .findUnique({ where: { userId: userId }, select: { offersBlock: true } })
    .then((r) => r.offersBlock);
}

export async function setBlockedList(userId: string, list: string[]) {
  return await prisma.economy
    .update({ where: { userId: userId }, data: { offersBlock: list } })
    .then((r) => r.offersBlock);
}

export async function deleteOffer(offer: Offer, client: NypsiClient) {
  offer = await prisma.offer.findUnique({ where: { messageId: offer.messageId } });
  if (offer.sold || !offer) return false;

  await prisma.offer.delete({ where: { messageId: offer.messageId } });

  await addBalance(offer.ownerId, Number(offer.money));

  (async () => {
    const user = await client.users.fetch(offer.targetId);
    if (!user) return true;

    const channel = await user.createDM();

    const msg = await channel.messages.fetch(offer.messageId);
    if (!msg) return true;
    const embed = new EmbedBuilder(msg.embeds[0]);

    embed.data.description = embed.data.description.split("\n")[0] + "\n\n**no longer valid**";
    embed.setColor(Constants.EMBED_FAIL_COLOR);

    await msg.edit({ components: [], embeds: [embed] });
  })();
  return true;
}

export async function checkOffer(offer: Offer, client: NypsiClient) {
  const inventory = await getInventory(offer.targetId).catch(() => []);

  if (offer.sold) return;

  if (
    !inventory.find((i) => i.item === offer.itemId) ||
    inventory.find((i) => i.item === offer.itemId).amount < offer.itemAmount
  )
    return deleteOffer(offer, client);
}

export async function getOffersAverage(item: string) {
  if (await redis.exists(`${Constants.redis.cache.economy.OFFER_AVG}:${item}`))
    return parseInt(await redis.get(`${Constants.redis.cache.economy.OFFER_AVG}:${item}`));

  const offers = await prisma.offer.findMany({
    where: {
      AND: [{ sold: true }, { itemId: item }, { soldAt: { gt: Constants.SEASON_START } }],
    },
    select: {
      money: true,
      itemAmount: true,
    },
    orderBy: {
      soldAt: "desc",
    },
    take: 30,
  });

  const costs: number[] = [];

  for (const offer of offers) {
    if (costs.length >= 500) break;

    if (offer.itemAmount > 1) {
      costs.push(Math.floor(Number(offer.money / offer.itemAmount)));
    } else {
      costs.push(Number(offer.money));
    }
  }

  let filtered = filterOutliers(costs);

  if (!filtered) {
    logger.warn("failed to filter outliers (offers)", { costs, item, offers });
    filtered = costs;
  }

  const sum = costs.reduce((a, b) => a + b, 0);
  const avg = Math.floor(sum / costs.length) || 0;

  await redis.set(`${Constants.redis.cache.economy.OFFER_AVG}:${item}`, avg, "EX", 3600 * 3);

  return avg;
}
