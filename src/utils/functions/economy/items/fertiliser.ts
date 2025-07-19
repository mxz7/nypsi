import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { fertiliseFarm, getFarm } from "../farm";

module.exports = new ItemUse(
  "fertiliser",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    const farm = await getFarm(message.author.id);

    if (farm.length === 0)
      return ItemUse.send(message, { embeds: [new ErrorEmbed("you have no plants")] });

    const res = await fertiliseFarm(message.author.id);

    if (res.msg === "no fertiliser") {
      return ItemUse.send(message, {
        embeds: [
          new ErrorEmbed(
            "you don't have any fertiliser" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    } else if (res.msg === "no need") {
      return ItemUse.send(message, {
        embeds: [
          new ErrorEmbed(
            "none of your plants need fertiliser" +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }

    if (res.done) {
      return ItemUse.send(message, {
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ you have fertilised ${res.done} plants` +
              (res?.dead > 0 ? `\n\n${res.dead} of your plants have died` : ""),
          ),
        ],
      });
    }
  },
);
