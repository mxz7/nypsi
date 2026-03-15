import { AutocompleteHandler } from "../types/InteractionHandler";
import { getMuseumCategories } from "../utils/functions/economy/museum";

export default {
  name: "museum-category",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    return await interaction.respond(
      getMuseumCategories()
        .filter((i) => i && i.includes(focused.value))
        .map((category) => ({
          name: category,
          value: category,
        })),
    );
  },
} as AutocompleteHandler;
