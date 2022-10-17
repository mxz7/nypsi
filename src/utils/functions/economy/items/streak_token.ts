import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import prisma from "../../../../init/database";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse("streak_token", async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
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

  const query = await prisma.economy.update({
    where: {
      userId: message.author.id,
    },
    data: {
      dailyStreak: { increment: 1 },
    },
    select: {
      dailyStreak: true,
    },
  });

  const inventory = await getInventory(message.member, false);

  await setInventoryItem(message.member, "streak_token", inventory.find((i) => i.item == "streak_token").amount - 1, false);

  const msg = await send({ embeds: [new CustomEmbed(message.member, "applying token...")] });

  return edit(
    {
      embeds: [new CustomEmbed(message.member, `applying token...\n\nyour new daily streak is: \`${query.dailyStreak}\``)],
    },
    msg
  );
});
