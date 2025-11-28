import { CommandInteraction } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getMember } from "../../member";
import { escapeFormattingCharacters } from "../../string";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

module.exports = new ItemUse(
  "rick_astley",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    if (args.length === 1)
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid member")] });

    const target = await getMember(message.guild, args.slice(1, args.length).join(" "));

    if (!target) return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid member")] });

    if (await redis.exists(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`))
      return ItemUse.send(message, {
        embeds: [
          new ErrorEmbed(
            `${escapeFormattingCharacters(target.user.username)} already has a rick roll queued`,
          ),
        ],
      });

    await removeInventoryItem(message.member, "rick_astley", 1);
    await addStat(message.member, "rick_astley");

    await redis.set(`${Constants.redis.nypsi.RICKROLL}:${target.user.id}`, message.author.id);

    return ItemUse.send(message, {
      embeds: [
        new CustomEmbed(
          message.member,
          `<a:rick_astley:1100529748796506203> **${escapeFormattingCharacters(target.user.username)}** will be rick rolled soon xd !!!!`,
        ),
      ],
    });
  },
);
