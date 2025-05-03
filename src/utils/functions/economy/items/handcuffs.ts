import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getDisabledCommands } from "../../guilds/disabledcommands";
import { getMember } from "../../member";
import { getInventory, removeInventoryItem } from "../inventory";
import { isPassive } from "../passive";
import { addHandcuffs, createUser, isHandcuffed, userExists } from "../utils";

module.exports = new ItemUse(
  "handcuffs",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        if (message.deferred) {
          await message.editReply(data as InteractionEditReplyOptions);
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
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if ((await getDisabledCommands(message.guild)).includes("rob")) {
      return send({
        embeds: [new ErrorEmbed(`handcuffs have been disabled in ${message.guild.name}`)],
      });
    }

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/use handcuffs <member>")],
      });
    }

    const handcuffsTarget = await getMember(message.guild, args[1]);

    if (!handcuffsTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == handcuffsTarget) {
      return send({ embeds: [new ErrorEmbed("bit of self bondage huh")] });
    }

    if (await isHandcuffed(handcuffsTarget.user.id)) {
      return send({
        embeds: [new ErrorEmbed(`**${handcuffsTarget.user.username}** is already restrained`)],
      });
    }

    if (!(await userExists(handcuffsTarget))) await createUser(handcuffsTarget);

    if (await isPassive(handcuffsTarget))
      return send({
        embeds: [new ErrorEmbed(`${handcuffsTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return send({ embeds: [new ErrorEmbed("you are currently in passive mode")] });

    const inventory = await getInventory(message.member);

    await Promise.all([
      removeInventoryItem(message.member, "handcuffs", 1),
      addHandcuffs(handcuffsTarget.id),
    ]);

    const msg = await send({
      embeds: [
        new CustomEmbed(message.member, `restraining **${handcuffsTarget.user.username}**...`),
      ],
    });

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `restraining **${handcuffsTarget.user.username}**...\n\n**${handcuffsTarget.user.username}** has been restrained for one minute`,
          ),
        ],
      },
      msg,
    );
  },
);
