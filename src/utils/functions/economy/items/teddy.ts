import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { addStat } from "../stats";

export default new ItemUse(
  "teddy",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    await addStat(message.member, "teddy");

    return input.send({
      embeds: [
        new CustomEmbed(message.member, "you cuddle your teddy bear").setImage(
          "https://c.tenor.com/QGoHlSF2cSAAAAAM/hug-milk-and-mocha.gif",
        ),
      ],
    });
  },
);
