import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { hasPadlock, setPadlock } from "../balance";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

module.exports = new ItemUse(
  "padlock",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    if (await hasPadlock(message.member)) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("you already have a padlock on your balance")],
      });
    }

    await Promise.all([
      removeInventoryItem(message.member, "padlock", 1),
      addStat(message.member, "padlock"),
      setPadlock(message.member, true),
    ]);

    return ItemUse.send(message, {
      embeds: [new CustomEmbed(message.member, "✅ your padlock has been applied")],
    });
  },
);
