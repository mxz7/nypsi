import {
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import sleep from "../../sleep";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

export default new ItemUse(
  "chastity_cage",
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

    const chastityTarget = input.target;

    if (message.member == chastityTarget) {
      return input.send({
        embeds: [new ErrorEmbed("you can't use a chastity cage on yourself")],
      });
    }

    if (
      (await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${chastityTarget.user.id}`)) ==
      1
    ) {
      return input.send({
        embeds: [
          new ErrorEmbed(
            `**${chastityTarget.user.username.replaceAll("_", "\\_")}** is already equipped with a chastity cage`,
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

    const msg = await input.send({
      embeds: [new CustomEmbed(message.member, "locking chastity cage...")],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `locking chastity cage...\n\n**${chastityTarget.user.username.replaceAll("_", "\\_")}**'s chastity cage is now locked in place`,
          ),
        ],
      },
      msg,
    );
  },
  { target: true },
);
