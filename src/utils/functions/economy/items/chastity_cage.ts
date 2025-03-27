import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getMember } from "../../member";
import sleep from "../../sleep";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "chastity_cage",
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

    const edit = async (data: MessageEditOptions, msg: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/use chastity <member>")],
      });
    }

    const chastityTarget = await getMember(message.guild, args[1]);

    if (!chastityTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == chastityTarget) {
      return send({
        embeds: [new ErrorEmbed("why would you do that to yourself.")],
      });
    }

    if (
      (await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`)) ==
      1
    ) {
      return send({
        embeds: [
          new ErrorEmbed(
            `**${chastityTarget.user.username}** is already equipped with a chastity cage`,
          ),
        ],
      });
    }

    await redis.set(
      `${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`,
      Date.now(),
      "EX",
      10800,
    );

    const inventory = await getInventory(message.member);

    await setInventoryItem(
      message.member,
      "chastity_cage",
      inventory.find((i) => i.item == "chastity_cage").amount - 1,
    );

    const msg = await send({
      embeds: [new CustomEmbed(message.member, "locking chastity cage...")],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `locking chastity cage...\n\n**${chastityTarget.user.username}**'s chastity cage is now locked in place`,
          ),
        ],
      },
      msg,
    );
  },
);
