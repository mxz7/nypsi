import { CommandInteraction } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { escapeFormattingCharacters } from "../../string";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

export default new ItemUse(
  "rick_astley",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    const target = input.target;

    if (target.user.id === message.author.id)
      return input.send({
        embeds: [new ErrorEmbed("you can't use rick astley on yourself")],
      });

    if (await redis.exists(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`))
      return input.send({
        embeds: [
          new ErrorEmbed(
            `${escapeFormattingCharacters(target.user.username)} already has a rick roll queued`,
          ),
        ],
      });

    await removeInventoryItem(message.member, "rick_astley", 1);
    await addStat(message.member, "rick_astley");

    await redis.set(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`, message.author.id);

    return input.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `<a:rick_astley:1100529748796506203> **${escapeFormattingCharacters(target.user.username)}** will be rick rolled soon xd !!!!`,
        ),
      ],
    });
  },
  { target: true },
);
