import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";

module.exports = new ItemUse(
  "calendar",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    return ItemUse.send(message, {
      embeds: [new CustomEmbed(message.member, "calendars will be used automatically")],
    });
  },
);
