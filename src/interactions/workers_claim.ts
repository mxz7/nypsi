import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { claimFromWorkers } from "../utils/functions/economy/workers";

export default {
  name: "w-claim",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    await interaction.deferReply();
    const desc = await claimFromWorkers(interaction.user.id);

    const embed = new CustomEmbed()
      .setDescription(desc)
      .setColor(Constants.EMBED_SUCCESS_COLOR)
      .setHeader("workers", interaction.user.avatarURL())
      .disableFooter();

    return interaction.editReply({ embeds: [embed] });
  },
} as InteractionHandler;
