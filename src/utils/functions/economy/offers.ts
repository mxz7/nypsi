import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
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
    `${owner.user.tag} offers $**${money.toLocaleString()}** for your *${itemAmount.toLocaleString()}x* ${
      getItems()[itemId].emoji
    } ${getItems()[itemId].name}\n\ndo you accept?`
  ).setHeader(`${owner.user.username}'s offer`, owner.user.avatarURL());

  const msg = await target
    .send({
      content: `you've received an offer for ${itemAmount.toLocaleString()}x ${getItems()[itemId].name}`,
      embeds: [embed],
      components: [row],
    })
    .catch(() => {});

  if (!msg) return false;

  await prisma.offers.create({
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
  return await prisma.offers.findMany({ where: { ownerId: userId } });
}

export async function getTargetedOffers(userId: string) {
  return await prisma.offers.findMany({ where: { targetId: userId } });
}

export async function getBlockedList(userId: string) {
  return await prisma.economy
    .findUnique({ where: { userId: userId }, select: { offersBlock: true } })
    .then((r) => r.offersBlock);
}

export async function setBlockedList(userId: string, list: string[]) {
  return await prisma.economy.update({ where: { userId: userId }, data: { offersBlock: list } }).then((r) => r.offersBlock);
}
