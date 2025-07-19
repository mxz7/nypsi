import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { getPrefix } from "../../guilds/utils";

module.exports = new ItemUse(
  "lottery_ticket",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    return ItemUse.send(message, {
      embeds: [
        new CustomEmbed(
          message.member,
          `lottery tickets will automatically be used. ${(await getPrefix(message.guild))[0]}**lotto** for more information`,
        ),
      ],
    });
  },
);
