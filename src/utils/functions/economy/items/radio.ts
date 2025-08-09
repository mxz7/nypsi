import {
  CommandInteraction,
  InteractionEditReplyOptions,
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
import { removeInventoryItem } from "../inventory";
import { isPassive } from "../passive";
import { addStat } from "../stats";

module.exports = new ItemUse(
  "radio",
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

    if (args.length == 1) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("/use radio <member>")],
      });
    }

    const radioTarget = await getMember(message.guild, args[1]);

    if (!radioTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == radioTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if (await isPassive(radioTarget))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`${radioTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("you are currently in passive mode")],
      });

    if ((await redis.exists(`${Constants.redis.cooldown.ROB_RADIO}:${radioTarget.user.id}`)) == 1) {
      return ItemUse.send(message, {
        embeds: [
          new ErrorEmbed(
            `the police are already looking for **${radioTarget.user.username.replaceAll("_", "\\_")}**`,
          ),
        ],
      });
    }

    await redis.set(
      `${Constants.redis.cooldown.ROB_RADIO}:${radioTarget.user.id}`,
      Date.now(),
      "EX",
      900,
    );

    await removeInventoryItem(message.member, "radio", 1);
    await addStat(message.member, "radio");

    const msg = await ItemUse.send(message, {
      embeds: [new CustomEmbed(message.member, "putting report out on police scanner...")],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `putting report out on police scanner...\n\nthe police are now looking for **${radioTarget.user.username.replaceAll("_", "\\_")}**`,
          ),
        ],
      },
      msg,
    );
  },
);
