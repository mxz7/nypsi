import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse("mask", async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
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

  const robCooldown = (await redis.exists(`cd:rob:${message.author.id}`)) == 1;
  const bankRobCooldown = (await redis.exists(`cd:bankrob:${message.author.id}`)) == 1;
  const storeRobcooldown = (await redis.exists(`cd:storerob:${message.author.id}`)) == 1;
  if (!robCooldown && !bankRobCooldown && !storeRobcooldown) {
    return send({
      embeds: [new ErrorEmbed("you are currently not on a rob cooldown")],
    });
  }

  const embed = new CustomEmbed(message.member);

  if (robCooldown) {
    await redis.del(`cd:rob:${message.author.id}`);
    embed.setDescription("you're wearing your **mask** and can now rob someone again");
  } else if (bankRobCooldown) {
    await redis.del(`cd:bankrob:${message.author.id}`);
    embed.setDescription("you're wearing your **mask** and can now rob a bank again");
  } else if (storeRobcooldown) {
    await redis.del(`cd:storerob:${message.author.id}`);
    embed.setDescription("you're wearing your **mask** and can now rob a store again");
  }

  const inventory = await getInventory(message.member, false);
  await setInventoryItem(message.member, "mask", inventory.find((i) => i.item == "mask").amount - 1, false);

  return send({ embeds: [embed] });
});
