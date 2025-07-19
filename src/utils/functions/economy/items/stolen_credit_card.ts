import { CommandInteraction } from "discord.js";
import { randomInt } from "node:crypto";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import sleep from "../../sleep";
import { pluralize } from "../../string";
import { increaseBaseBankStorage } from "../balance";
import { getInventory, removeInventoryItem } from "../inventory";
import { addStat } from "../stats";
import { formatNumber } from "../utils";

module.exports = new ItemUse(
  "stolen_credit_card",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const inventory = await getInventory(message.member);

    let amount = 1;

    if (args[1] && args[1].toLowerCase() === "all")
      args[1] = inventory.count("stolen_credit_card").toString();

    if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count("stolen_credit_card") < amount)
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("you dont have this many stolen credit cards")],
      });

    const addedAmount = randomInt(10_000 * amount, 250_000 * amount);

    await Promise.all([
      removeInventoryItem(message.member, "stolen_credit_card", amount),
      addStat(message.member, "stolen_credit_card", amount),
      increaseBaseBankStorage(message.member, addedAmount),
    ]);

    const msg = await ItemUse.send(message, {
      embeds: [
        new CustomEmbed(
          message.member,
          `using ${amount} ${pluralize("stolen credit card", amount)}...`,
        ),
      ],
    });

    await sleep(2000);

    return msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          `using ${amount} ${pluralize("stolen credit card", amount)}...\n\nsuccessfully added $**${addedAmount.toLocaleString()}** to your bank capacity`,
        ),
      ],
    });
  },
);
