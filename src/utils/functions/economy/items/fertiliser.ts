import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { fertiliseFarm, getFarm } from "../farm";

module.exports = new ItemUse(
  "fertiliser",
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

    const farm = await getFarm(message.author.id);

    if (farm.length === 0) return send({ embeds: [new ErrorEmbed("you have no plants")] });

    const res = await fertiliseFarm(message.author.id);

    if (res.msg === "no fertiliser") {
      return send({
        embeds: [
          new ErrorEmbed(
            "you don't have any fertiliser" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    } else if (res.msg === "no need") {
      return send({
        embeds: [
          new ErrorEmbed(
            "none of your plants need fertiliser" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }

    if (res.done) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ you have fertilised ${res.done} plants` +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }
  },
);
