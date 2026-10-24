import {
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { getDisabledCommands } from "../../guilds/disabledcommands";
import { removeInventoryItem } from "../inventory";
import { isPassive } from "../passive";
import { addStat } from "../stats";
import { addHandcuffs, createUser, isHandcuffed, userExists } from "../utils";

export default new ItemUse(
  "handcuffs",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
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
      return input.send({
        embeds: [new ErrorEmbed(`handcuffs have been disabled in ${message.guild.name}`)],
      });
    }

    const handcuffsTarget = input.target;

    if (message.member == handcuffsTarget) {
      return input.send({ embeds: [new ErrorEmbed("you can't use handcuffs on yourself")] });
    }

    if (await isHandcuffed(handcuffsTarget.user.id)) {
      return input.send({
        embeds: [
          new ErrorEmbed(
            `**${handcuffsTarget.user.username.replaceAll("_", "\\_")}** is already restrained`,
          ),
        ],
      });
    }

    if (!(await userExists(handcuffsTarget))) await createUser(handcuffsTarget);

    if (await isPassive(handcuffsTarget))
      return input.send({
        embeds: [new ErrorEmbed(`${handcuffsTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return input.send({
        embeds: [new ErrorEmbed("you are currently in passive mode")],
      });

    await Promise.all([
      removeInventoryItem(message.member, "handcuffs", 1),
      addStat(message.member, "handcuffs"),
      addHandcuffs(handcuffsTarget.id),
    ]);

    const msg = await input.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `restraining **${handcuffsTarget.user.username.replaceAll("_", "\\_")}**...`,
        ),
      ],
    });

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `restraining **${handcuffsTarget.user.username.replaceAll("_", "\\_")}**...\n\n**${handcuffsTarget.user.username.replaceAll("_", "\\_")}** has been restrained for one minute`,
          ),
        ],
      },
      msg,
    );
  },
  { target: true },
);
