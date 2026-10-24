import { CommandInteraction } from "discord.js";
import prisma from "../../../../init/database";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { MStoTime } from "../../date";
import sleep from "../../sleep";
import { pluralize } from "../../string";
import { getCraftingItems } from "../crafting";
import { getInventory, removeInventoryItem } from "../inventory";
import { getItemUseAmountError } from "../item-use";
import { addStat } from "../stats";
import { getItems } from "../utils";
import dayjs = require("dayjs");

export default new ItemUse(
  "bob",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    const crafting = await prisma.crafting.findMany({
      where: {
        userId: message.author.id,
      },
      select: {
        finished: true,
        id: true,
        itemId: true,
        amount: true,
      },
    });

    if (crafting.length < 1)
      return input.send({
        embeds: [new ErrorEmbed("you are not currently crafting anything")],
      });

    const inventory = await getInventory(message.member);

    let amount = input.amount;

    if (!amount || isNaN(amount) || amount < 1)
      return input.send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count("bob") < amount)
      return input.send({
        embeds: [new ErrorEmbed(getItemUseAmountError(input.item, inventory.count("bob"), amount))],
      });

    const breakdown: string[] = [];

    let maxUsedAmount = 0;

    for (const item of crafting) {
      const remainingMs = item.finished.getTime() - Date.now();
      const remainingHours = remainingMs / (1000 * 60 * 60);

      const usableAmount = Math.min(amount, Math.ceil(remainingHours));
      if (usableAmount <= 0) continue;

      const newDate = dayjs(item.finished).subtract(usableAmount, "hour").toDate();

      let oldDateText = MStoTime(item.finished.getTime() - Date.now());
      if (Date.now() > item.finished.getTime()) {
        oldDateText = "done";
      }

      let newDateText = MStoTime(newDate.getTime() - Date.now());
      if (Date.now() > newDate.getTime()) {
        newDateText = "done";
      }

      breakdown.push(
        `\`${item.amount.toLocaleString()}x\` ${getItems()[item.itemId].emoji} ${
          getItems()[item.itemId].name
        }: \`${oldDateText}\` → \`${newDateText}\``,
      );

      if (usableAmount > maxUsedAmount) {
        maxUsedAmount = usableAmount;
      }

      await prisma.crafting.update({
        where: {
          id: item.id,
        },
        data: {
          finished: newDate,
        },
      });
    }

    if (maxUsedAmount == 0)
      return input.send({
        embeds: [new ErrorEmbed("you are not currently crafting anything")],
      });

    await removeInventoryItem(message.member, "bob", maxUsedAmount);
    await addStat(message.member, "bob", maxUsedAmount);

    getCraftingItems(message.member);

    const msg = await input.send({
      embeds: [
        new CustomEmbed(message.member, "<:nypsi_bob:1078776552067694672> sending bob to work..."),
      ],
    });

    await sleep(2000);

    const embed = new CustomEmbed(
      message.member,
      `<:nypsi_bob:1078776552067694672> bob has removed ${maxUsedAmount} ${pluralize("hour", maxUsedAmount)} of crafting time from ${crafting.length} ${pluralize("item", crafting.length)}\n\n${breakdown.join("\n")}`,
    );
    if (maxUsedAmount < input.amount) {
      embed.setFooter({
        text: `used ${maxUsedAmount} of ${input.amount.toLocaleString()} bobs to finish the remaining crafting time`,
      });
    }
    return msg.edit({ embeds: [embed] });
  },
  { amount: true },
);
