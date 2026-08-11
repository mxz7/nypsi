import { MessageFlags } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { updatePreference } from "../utils/functions/users/preferences";

export default {
  name: "btn-enable-vote-reminders",
  type: "interaction",
  async run(interaction) {
    await updatePreference(interaction.user.id, "dms.voteReminder", true);

    return interaction.reply({
      embeds: [
        new CustomEmbed(
          null,
          "✅ vote reminders have been enabled, you now have an extra **2%** gamble multi and **5%** sell multi",
        ).setColor(Constants.EMBED_SUCCESS_COLOR),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
} as InteractionHandler;
