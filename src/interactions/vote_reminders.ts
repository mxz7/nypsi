import { MessageFlags } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { getDmSettings, updateDmSettings } from "../utils/functions/users/notifications";

export default {
  name: "enable-vote-reminders",
  type: "interaction",
  async run(interaction) {
    const settings = await getDmSettings(interaction.user.id);
    settings.voteReminder = true;
    await updateDmSettings(interaction.user.id, settings);

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
