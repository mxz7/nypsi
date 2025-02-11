import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "mask",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
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

    const robCooldown = (await redis.exists(`cd:rob:${message.author.id}`)) == 1;
    const bankRobCooldown = (await redis.exists(`cd:bankrob:${message.author.id}`)) == 1;
    const storeRobCooldown = (await redis.exists(`cd:storerob:${message.author.id}`)) == 1;
    if (!robCooldown && !bankRobCooldown && !storeRobCooldown) {
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
    } else if (storeRobCooldown) {
      await redis.del(`cd:storerob:${message.author.id}`);
      embed.setDescription("you're wearing your **mask** and can now rob a store again");
    }

    const inventory = await getInventory(message.member);
    await setInventoryItem(
      message.member,
      "mask",
      inventory.find((i) => i.item == "mask").amount - 1,
    );

    return send({ embeds: [embed] });
  },
);
