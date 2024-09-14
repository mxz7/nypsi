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
        new CustomEmbed(null, "✅ vote reminders have been enabled").setColor(
          Constants.EMBED_SUCCESS_COLOR,
        ),
      ],
    });
  },
} as InteractionHandler;
