import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, setInventoryItem } from "../inventory";
import { doDaily } from "../utils";

module.exports = new ItemUse(
  "streak_token",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
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

    await setInventoryItem(
      message.member,
      "streak_token",
      inventory.find((i) => i.item == "streak_token").amount - 1,
    );

    const embed = await doDaily(message.member);

    return send({ embeds: [embed] });
  },
);
