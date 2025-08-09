import { CommandInteraction } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

module.exports = new ItemUse(
  "mask",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    const robCooldown = (await redis.exists(`cd:rob:${message.author.id}`)) == 1;
    const bankRobCooldown = (await redis.exists(`cd:bankrob:${message.author.id}`)) == 1;
    const storeRobCooldown = (await redis.exists(`cd:storerob:${message.author.id}`)) == 1;
    if (!robCooldown && !bankRobCooldown && !storeRobCooldown) {
      return ItemUse.send(message, {
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

    await removeInventoryItem(message.member, "mask", 1);
    await addStat(message.member, "mask");

    return ItemUse.send(message, { embeds: [embed] });
  },
);
