import {
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getDisabledCommands } from "../../guilds/disabledcommands";
import { getMember } from "../../member";
import { removeInventoryItem } from "../inventory";
import { isPassive } from "../passive";
import { addStat } from "../stats";
import { addHandcuffs, createUser, isHandcuffed, userExists } from "../utils";

module.exports = new ItemUse(
  "handcuffs",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const edit = async (data: MessageEditOptions, msg: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if ((await getDisabledCommands(message.guild)).includes("rob")) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`handcuffs have been disabled in ${message.guild.name}`)],
      });
    }

    if (args.length == 1) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("/use handcuffs <member>")],
      });
    }

    const handcuffsTarget = await getMember(message.guild, args[1]);

    if (!handcuffsTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == handcuffsTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("bit of self bondage huh")] });
    }

    if (await isHandcuffed(handcuffsTarget.user.id)) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`**${handcuffsTarget.user.username}** is already restrained`)],
      });
    }

    if (!(await userExists(handcuffsTarget))) await createUser(handcuffsTarget);

    if (await isPassive(handcuffsTarget))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`${handcuffsTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("you are currently in passive mode")],
      });

    await Promise.all([
      removeInventoryItem(message.member, "handcuffs", 1),
      addStat(message.member, "handcuffs"),
      addHandcuffs(handcuffsTarget.id),
    ]);

    const msg = await ItemUse.send(message, {
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
