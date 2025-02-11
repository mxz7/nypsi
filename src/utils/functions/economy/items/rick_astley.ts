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
import Constants from "../../../Constants";
import { getMember } from "../../member";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "rick_astley",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
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

    if (args.length === 1) return send({ embeds: [new ErrorEmbed("invalid member")] });

    const target = await getMember(message.guild, args.slice(1, args.length).join(" "));

    if (!target) return send({ embeds: [new ErrorEmbed("invalid member")] });

    const inventory = await getInventory(message.member);

    if (await redis.exists(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`))
      return send({
        embeds: [new ErrorEmbed(`${target.user.username} already has a rick roll queued`)],
      });

    await setInventoryItem(
      message.member,
      "rick_astley",
      inventory.find((i) => i.item === "rick_astley").amount - 1,
    );

    await redis.set(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`, message.author.id);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `<a:rick_astley:1100529748796506203> **${target.user.username}** will be rick rolled soon xd !!!!`,
        ),
      ],
    });
  },
);
