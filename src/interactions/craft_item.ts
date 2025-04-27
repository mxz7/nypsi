import { AutocompleteHandler } from "../types/InteractionHandler";
import { getItems } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

export default {
  name: "craft-item",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const items = getItems();

    let options = Object.keys(items).filter(
      (item) =>
        items[item].craft &&
        (item.includes(focused.value) ||
          items[item].name.includes(focused.value) ||
          items[item].aliases?.includes(focused.value)),
    );

    if (options.length > 25) options = options.splice(0, 24);

    if (options.length == 0) return interaction.respond([]);

    const formatted = options.map((i) => ({
      name: `${
        items[i].emoji.startsWith("<:") ||
        items[i].emoji.startsWith("<a:") ||
        items[i].emoji.startsWith(":")
          ? ""
          : `${items[i].emoji} `
      }${items[i].name}`,
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
