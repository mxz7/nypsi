import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";

module.exports = new ItemUse("calendar", async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
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

  return send({ embeds: [new CustomEmbed(message.member, "calendars will be used automatically")] });
});
