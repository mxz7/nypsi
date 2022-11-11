import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, setInventoryItem } from "../inventory";
import { doDaily } from "../utils";

module.exports = new ItemUse("streak_token", async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const inventory = await getInventory(message.member);

  await setInventoryItem(
    message.member,
    "stolen_credit_card",
    inventory.find((i) => i.item == "stolen_credit_card").amount - 1,
    false
  );

  const embed = await doDaily(message.member);

  return send({ embeds: [embed] });
});
