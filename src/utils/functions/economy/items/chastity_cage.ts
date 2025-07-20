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
import { addStat } from "../stats";

module.exports = new ItemUse(
  "chastity_cage",
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
        embeds: [new ErrorEmbed("/use chastity <member>")],
      });
    }

    const chastityTarget = await getMember(message.guild, args[1]);

    if (!chastityTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == chastityTarget) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("why would you do that to yourself.")],
      });
    }

    if (
      (await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`)) ==
      1
    ) {
      return ItemUse.send(message, {
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

    await removeInventoryItem(message.member, "chastity_cage", 1);
    await addStat(message.member, "chastity_cage");

    const msg = await ItemUse.send(message, {
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
