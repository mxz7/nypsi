import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { hasPadlock, setPadlock } from "../balance";
import { removeInventoryItem } from "../inventory";
import { addStat } from "../stats";

export default new ItemUse(
  "padlock",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    if (await hasPadlock(message.member)) {
      return input.send({
        embeds: [new ErrorEmbed("you already have a padlock on your balance")],
      });
    }

    await Promise.all([
      removeInventoryItem(message.member, "padlock", 1),
      addStat(message.member, "padlock"),
      setPadlock(message.member, true),
    ]);

    return input.send({
      embeds: [new CustomEmbed(message.member, "✅ your padlock has been applied")],
    });
  },
);
