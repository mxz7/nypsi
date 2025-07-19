import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { pluralize } from "../../string";
import { getInventory } from "../inventory";
import { addStat } from "../stats";
import { getItems } from "../utils";

module.exports = new ItemUse(
  "bitch",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    await addStat(message.member, "bitch");

    const inventory = await getInventory(message.member);

    return ItemUse.send(message, {
      embeds: [
        new CustomEmbed(
          message.member,
          `you had fun with your ${pluralize(getItems()["bitch"], inventory.count("bitch"))}`,
        ),
      ],
    });
  },
);
