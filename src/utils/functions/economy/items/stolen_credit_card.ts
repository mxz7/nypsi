import { randomInt } from "node:crypto";
import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import sleep from "../../sleep";
import { pluralize } from "../../string";
import { increaseBaseBankStorage } from "../balance";
import { getInventory, removeInventoryItem } from "../inventory";
import { getItemUseAmountError } from "../item-use";
import { addStat } from "../stats";

export default new ItemUse(
  "stolen_credit_card",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    const inventory = await getInventory(message.member);

    let amount = input.amount;

    if (!amount || isNaN(amount) || amount < 1)
      return input.send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count("stolen_credit_card") < amount)
      return input.send({
        embeds: [
          new ErrorEmbed(
            getItemUseAmountError(input.item, inventory.count("stolen_credit_card"), amount),
          ),
        ],
      });

    const addedAmount = randomInt(10_000 * amount, 250_000 * amount);

    await Promise.all([
      removeInventoryItem(message.member, "stolen_credit_card", amount),
      addStat(message.member, "stolen_credit_card", amount),
      increaseBaseBankStorage(message.member, addedAmount),
    ]);

    const msg = await input.send({
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
  { amount: true },
);
