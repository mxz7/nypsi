import { AutocompleteHandler } from "../types/InteractionHandler";
import { getAchievements } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

export default {
  name: "achievement",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const achievements = getAchievements();

    let options = Object.keys(achievements).filter(
      (i) =>
        i.includes(focused.value) ||
        achievements[i].name.replaceAll("*", "").toLowerCase().includes(focused.value),
    );

    if (options.length > 25) options = options.splice(0, 24);

    if (options.length == 0) return interaction.respond([]);

    const formatted = options.map((i) => ({
      name: `${
        achievements[i].emoji.startsWith("<:") ||
        achievements[i].emoji.startsWith("<a:") ||
        achievements[i].emoji.startsWith(":")
          ? ""
          : `${achievements[i].emoji} `
      }${achievements[i].name.replaceAll("*", "")}`,
      value: i,
    }));

    return await interaction.respond(formatted).catch(() => {
      logger.warn(`failed to respond to autocomplete in time`, {
        userId: interaction.user.id,
        command: interaction.commandName,
      });
    });
  },
} as AutocompleteHandler;
