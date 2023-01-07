import { BaseMessageOptions, CommandInteraction, Interaction, InteractionReplyOptions, Message } from "discord.js";
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

    const card = new ScratchCard(message.member, selected);

    console.log(card.area);

    const msg = await send({ content: "area", components: card.getButtons() });

    const play = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 90000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected;
        })
        .catch(() => {
          fail = true;
          redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
          message.channel.send({ content: message.author.toString() + " scratch card expired" });
        });

      if (fail) return;

      if (!response || !response.isButton()) return;

      await card.clicked(response);
      await msg.edit({ components: card.getButtons() });
      return play();
    };
    return play();
  }
);
