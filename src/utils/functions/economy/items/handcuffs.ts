import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getMember } from "../../member";
import { getInventory, setInventoryItem } from "../inventory";
import { addHandcuffs, isHandcuffed } from "../utils";

module.exports = new ItemUse(
  "handcuffs",
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
        embeds: [new ErrorEmbed("/use handcuffs <member>")],
      });
    }

    let handcuffsTarget; // eslint-disable-line

    if (!message.mentions.members.first()) {
      handcuffsTarget = await getMember(message.guild, args[1]);
    } else {
      handcuffsTarget = message.mentions.members.first();
    }

    if (!handcuffsTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == handcuffsTarget) {
      return send({ embeds: [new ErrorEmbed("bit of self bondage huh")] });
    }

    if (await isHandcuffed(handcuffsTarget.user.id)) {
      return send({
        embeds: [new ErrorEmbed(`**${handcuffsTarget.user.tag}** is already restrained`)],
      });
    }

    const inventory = await getInventory(message.member, false);

    await Promise.all([
      setInventoryItem(message.member, "handcuffs", inventory.find((i) => i.item == "handcuffs").amount - 1, false),
      addHandcuffs(handcuffsTarget.id),
    ]);

    const msg = await send({ embeds: [new CustomEmbed(message.member, `restraining **${handcuffsTarget.user.tag}**...`)] });

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `restraining **${handcuffsTarget.user.tag}**...\n\n**${handcuffsTarget.user.tag}** has been restrained for one minute`
          ),
        ],
      },
      msg
    );
  }
);
