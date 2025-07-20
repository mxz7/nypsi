import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { addStat } from "../stats";

module.exports = new ItemUse(
  "teddy",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    await addStat(message.member, "teddy");

    return ItemUse.send(message, {
      embeds: [
        new CustomEmbed(message.member, "you cuddle your teddy bear").setImage(
          "https://c.tenor.com/QGoHlSF2cSAAAAAM/hug-milk-and-mocha.gif",
        ),
      ],
    });
  },
);
