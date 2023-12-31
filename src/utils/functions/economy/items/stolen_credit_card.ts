import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { randomInt } from "node:crypto";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import sleep from "../../sleep";
import { increaseBaseBankStorage } from "../balance";
import { getInventory, setInventoryItem } from "../inventory";
import { formatNumber } from "../utils";

module.exports = new ItemUse(
  "stolen_credit_card",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (message.deferred) {
          res = await message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data).catch(async () => {
              usedNewMessage = true;
              return await message.channel.send(data as BaseMessageOptions);
            });
          });
        }

        if (usedNewMessage && res instanceof Message) return res;

        const replyMsg = await message.fetchReply();
        if (replyMsg instanceof Message) {
          return replyMsg;
        }
      } else {
        return await message.channel.send(data as BaseMessageOptions);
      }
    };

    const inventory = await getInventory(message.member);

    let amount = 1;

    if (args[1] && args[1].toLowerCase() === "all")
      args[1] = inventory.find((i) => i.item === "stolen_credit_card").amount.toString();

    if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.find((i) => i.item === "stolen_credit_card").amount < amount)
      return send({ embeds: [new ErrorEmbed("you dont have this many stolen credit cards")] });

    const addedAmount = randomInt(10_000 * amount, 250_000 * amount);

    await Promise.all([
      setInventoryItem(
        message.member,
        "stolen_credit_card",
        inventory.find((i) => i.item == "stolen_credit_card").amount - amount,
      ),
      increaseBaseBankStorage(message.member, addedAmount),
    ]);

    const msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `using ${amount} stolen credit card${amount > 1 ? "s" : ""}...`,
        ),
      ],
    });

    await sleep(2000);

    return msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          `using ${amount} stolen credit card${
            amount > 1 ? "s" : ""
          }...\n\nsuccessfully added $**${addedAmount.toLocaleString()}** to your bank capacity`,
        ),
      ],
    });
  },
);
