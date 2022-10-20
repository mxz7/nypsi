import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getMember } from "../../member";
import sleep from "../../sleep";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "chastity_cage",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
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

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/use chastity <member>")],
      });
    }

    let chastityTarget: GuildMember; // eslint-disable-line

    if (!message.mentions.members.first()) {
      chastityTarget = await getMember(message.guild, args[1]);
    } else {
      chastityTarget = message.mentions.members.first();
    }

    if (!chastityTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == chastityTarget) {
      return send({
        embeds: [new ErrorEmbed("why would you do that to yourself.")],
      });
    }

    if ((await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`)) == 1) {
      return send({
        embeds: [new ErrorEmbed(`**${chastityTarget.user.tag}** is already equipped with a chastity cage`)],
      });
    }

    await redis.set(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`, Date.now());
    await redis.expire(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`, 10800);

    const inventory = await getInventory(message.member, false);

    await setInventoryItem(
      message.member,
      "chastity_cage",
      inventory.find((i) => i.item == "chastity_cage").amount - 1,
      false
    );

    const msg = await send({ embeds: [new CustomEmbed(message.member, "locking chastity cage...")] });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `locking chastity cage...\n\n**${chastityTarget.user.tag}**'s chastity cage is now locked in place`
          ),
        ],
      },
      msg
    );
  }
);
