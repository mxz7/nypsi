import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { getTier, isPremium } from "../../premium/premium";
import { getInventory, removeInventoryItem } from "../inventory";
import { getItemUseAmountError } from "../item-use";
import { addStat } from "../stats";
import { doDaily, getLastDaily } from "../utils";
import dayjs = require("dayjs");

export default new ItemUse(
  "streak_token",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    const inventory = await getInventory(message.member);

    const selected = input.item;

    let amount = input.amount;

    let max = 3;

    if (await isPremium(message.member)) {
      max = 5 + (await getTier(message.member)) * 5;
    }

    if (amount > max) amount = max;

    if (amount > inventory.count(selected.id))
      return input.send({
        embeds: [
          new ErrorEmbed(getItemUseAmountError(selected, inventory.count(selected.id), amount)),
        ],
      });

    await removeInventoryItem(message.member, "streak_token", amount);
    await addStat(message.member, "streak_token", amount);

    const embed = await doDaily(message.member, false, amount, false, true);
    if (amount < input.amount) {
      embed.setFooter({
        text: `${embed.data.footer?.text ? `${embed.data.footer.text} · ` : ""}limited to ${max} streak tokens per use`,
      });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("btn-run-daily")
        .setLabel("you haven't done /daily!"),
    );

    const lastDaily = await getLastDaily(message.member);

    if (dayjs(lastDaily.getTime()).isBefore(dayjs(), "day")) {
      return input.send({ embeds: [embed], components: [row] });
    }

    return input.send({ embeds: [embed] });
  },
  { amount: true },
);
