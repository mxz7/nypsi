import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";

module.exports = new ItemUse(
  "calendar",
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

    return send({
      embeds: [new CustomEmbed(message.member, "calendars will be used automatically")],
    });
  },
);
