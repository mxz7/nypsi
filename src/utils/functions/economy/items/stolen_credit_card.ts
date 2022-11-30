import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { randomInt } from "node:crypto";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import sleep from "../../sleep";
import { increaseBaseBankStorage } from "../balance";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "stolen_credit_card",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        if (message.deferred) {
          await message.editReply(data);
        } else {
          await message.reply(data as InteractionReplyOptions);
        }
        const replyMsg = await message.fetchReply();
        if (replyMsg instanceof Message) {
          return replyMsg;
        }
      } else {
        return await message.channel.send(data as BaseMessageOptions);
      }
    };

    const edit = async (data: MessageEditOptions, msg: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    const amount = randomInt(1000, 500_000);

    const inventory = await getInventory(message.member, false);

    await Promise.all([
      setInventoryItem(
        message.member,
        "stolen_credit_card",
        inventory.find((i) => i.item == "stolen_credit_card").amount - 1,
        false
      ),
      increaseBaseBankStorage(message.member, amount),
    ]);

    const msg = await send({ embeds: [new CustomEmbed(message.member, "using stolen credit card...")] });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `using stolen credit card...\n\nsuccessfully added $**${amount.toLocaleString()}** to your bank capacity`
          ),
        ],
      },
      msg
    );
  }
);
