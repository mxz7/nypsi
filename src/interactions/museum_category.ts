import { AutocompleteHandler } from "../types/InteractionHandler";
import { getItems } from "../utils/functions/economy/utils";

export default {
  name: "museum-category",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    return await interaction.respond(
      [
        ...new Set(
          Object.values(getItems())
            .map((item) => item.museum?.category)
            .filter((i) => i && i.includes(focused.value)),
        ),
      ]
        .sort()
        .map((category) => ({ name: category, value: category })),
    );
  },
} as AutocompleteHandler;
