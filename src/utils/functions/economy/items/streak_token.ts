import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getTier, isPremium } from "../../premium/premium";
import { getInventory, removeInventoryItem, selectItem } from "../inventory";
import { addStat } from "../stats";
import { doDaily, getLastDaily } from "../utils";
import dayjs = require("dayjs");

module.exports = new ItemUse(
  "streak_token",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const inventory = await getInventory(message.member);

    const selected = selectItem("streak_token");

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.count(selected.id);
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    }

    let max = 3;

    if (await isPremium(message.member)) {
      max = 5 + (await getTier(message.member)) * 5;
    }

    if (amount > max) amount = max;

    if (amount > inventory.count(selected.id))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`you don't have ${amount} ${selected.name}`)],
      });

    await removeInventoryItem(message.member, "streak_token", amount);
    await addStat(message.member, "streak_token", amount);

    const embed = await doDaily(message.member, false, amount, false, true);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("run-daily")
        .setLabel("you haven't done /daily!"),
    );

    const lastDaily = await getLastDaily(message.member);

    if (dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
      return ItemUse.send(message, { embeds: [embed], components: [row] });
    }

    return ItemUse.send(message, { embeds: [embed] });
  },
);
