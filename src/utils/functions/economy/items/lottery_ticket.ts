import { CommandInteraction } from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse, ItemUseRequest } from "../../../../models/ItemUse";
import { getPrefix } from "../../guilds/utils";

export default new ItemUse(
  "lottery_ticket",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    input: ItemUseRequest,
  ) => {
    return input.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `lottery tickets will automatically be used. ${(await getPrefix(message.guild))[0]}**lotto** for more information`,
        ),
      ],
    });
  },
  { suggest: false },
);
