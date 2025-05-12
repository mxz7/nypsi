import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, removeInventoryItem, selectItem } from "../inventory";
import { doDaily } from "../utils";
import { ErrorEmbed } from "../../../../models/EmbedBuilders";

module.exports = new ItemUse(
  "streak_token",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (message.deferred) {
          res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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

    const selected = selectItem("streak_token");

    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = inventory.find((i) => i.item === selected.id).amount;
    } else if (parseInt(args[1])) {
      amount = parseInt(args[1]);
    }

    if (amount > (inventory.find((i) => i.item === selected.id)?.amount || 0))
      return send({ embeds: [new ErrorEmbed(`you don't have ${amount} ${selected.name}`)] });

    await removeInventoryItem(message.member, "streak_token", amount);

    const embed = await doDaily(message.member, amount);

    return send({ embeds: [embed] });
  },
);
