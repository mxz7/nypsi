import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { addStat } from "../stats";

const responses = [
  "img:https://c.tenor.com/xycFj0Sr_2IAAAAd/tenor.gif",
  "img:https://c.tenor.com/rmOSRULjBj4AAAAC/tenor.gif",
  "img:https://c.tenor.com/ePP-BHO96PQAAAAC/tenor.gif",
];

module.exports = new ItemUse(
  "football",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    const chosen = responses[Math.floor(Math.random() * responses.length)];

    const embed = new CustomEmbed(message.member);

    if (chosen.startsWith("img:")) embed.setImage(chosen.substring(4, chosen.length));
    else embed.setDescription(chosen);

    await addStat(message.member, "football");

    return ItemUse.send(message, {
      embeds: [embed],
    });
  },
);
