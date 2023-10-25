import redis from "../init/redis";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { doProfileTransfer } from "../utils/functions/users/utils";

export default {
  name: "t-f-p-boobies",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const from = await redis.get(
      `${Constants.redis.nypsi.PROFILE_TRANSFER}:${interaction.user.id}`,
    );

    if (!from) return interaction.reply({ embeds: [new ErrorEmbed("expired")] });
    if (!(await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${from}`)))
      return interaction.reply({ embeds: [new ErrorEmbed("expired")] });

    await interaction.reply({ content: "transferring data..." });

    await doProfileTransfer(from, interaction.user.id);

    await interaction.editReply({ content: "done" });
  },
} as InteractionHandler;
