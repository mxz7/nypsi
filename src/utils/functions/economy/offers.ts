import { Offer } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { getBalance, updateBalance } from "./balance";
import { getInventory } from "./inventory";
import { getItems } from "./utils";

export async function createOffer(target: User, itemId: string, itemAmount: number, money: number, owner: GuildMember) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("accept-offer").setLabel("accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("deny-offer").setLabel("deny").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("block-item").setLabel("block item").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("block-user").setLabel("block user").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("disable-offers").setLabel("disable all offers").setStyle(ButtonStyle.Secondary)
  );

  const embed = new CustomEmbed(
    owner,
    `${owner.user.tag} offers $**${money.toLocaleString()}** for your **${itemAmount.toLocaleString()}x** ${
      getItems()[itemId].emoji
    } ${getItems()[itemId].name}\n\ndo you accept?`
  ).setHeader(`${owner.user.username}'s offer`, owner.user.avatarURL());

  if (itemAmount > 1 && money > 1000) {
    embed.setFooter({ text: `$${Math.floor(money / itemAmount).toLocaleString()} per ${getItems()[itemId].name}` });
  }

  const msg = await target
    .send({
      content: `you've received an offer for ${itemAmount.toLocaleString()}x ${getItems()[itemId].name}`,
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
  return await prisma.economy
    .findUnique({ where: { userId: userId }, select: { offersBlock: true } })
    .then((r) => r.offersBlock);
}

export async function setBlockedList(userId: string, list: string[]) {
  return await prisma.economy.update({ where: { userId: userId }, data: { offersBlock: list } }).then((r) => r.offersBlock);
}

export async function deleteOffer(offer: Offer, client: NypsiClient) {
  await prisma.offer.delete({ where: { messageId: offer.messageId } });

  await updateBalance(offer.ownerId, (await getBalance(offer.ownerId)) + Number(offer.money));

  const user = await client.users.fetch(offer.targetId);
  if (!user) return true;
  const msg = await user.dmChannel.messages.fetch(offer.messageId);
  if (!msg) return true;
  const embed = msg.embeds[0] as any;

  embed.data.description = embed.data.description.split("\n")[0] + "\n\n**no longer valid**";

  await msg.edit({ components: [], embeds: [embed] });
  return true;
}

export async function checkOffer(offer: Offer, client: NypsiClient) {
  const inventory = await getInventory(offer.targetId);

  if (
    !inventory.find((i) => i.item === offer.itemId) ||
    inventory.find((i) => i.item === offer.itemId).amount < offer.itemAmount
  )
    return deleteOffer(offer, client);
}
