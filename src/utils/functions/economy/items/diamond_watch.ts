import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import sleep from "../../sleep";

module.exports = new ItemUse("diamond_watch", async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
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

  const embed = new CustomEmbed(message.member, "you look down at your watch to check the time..");

  const msg = await send({ embeds: [embed] });

  await sleep(2000);

  return edit(
    { embeds: [embed.setDescription(`you look down at your watch to check the time..\n\nits ${new Date()}`)] },
    msg
  );
});
