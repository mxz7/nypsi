import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getInventory, selectItem } from "../inventory";
import ScratchCard from "../scratchies";

module.exports = new ItemUse(
  "scratch_card",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
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

    if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
      return send({ embeds: [new ErrorEmbed("you have an active game")], ephemeral: true });
    }

    const inventory = await getInventory(message.member);

    const selected = selectItem(args[0].toLowerCase());

    if (!selected || typeof selected == "string") {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (!inventory.find((i) => i.item == selected.id) || inventory.find((i) => i.item == selected.id).amount == 0) {
      return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
    }

    if (selected.role !== "scratch-card") return send({ embeds: [new ErrorEmbed("that is not a scratch card")] });

    // await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    const card = new ScratchCard(selected);

    console.log(card.area);

    const msg = await send({ content: "area", components: card.getButtons() });
  }
);
