import { AutocompleteHandler } from "../types/InteractionHandler";
import { getItems } from "../utils/functions/economy/utils";

export default {
  name: "museum-category",
  type: "autocomplete",
  async run(interaction) {
    return await interaction.respond(
      [
        ...new Set(
          Object.values(getItems())
            .map((item) => item.museum?.category)
            .filter(Boolean),
        ),
      ]
        .sort()
        .map((category) => ({ name: category, value: category })),
    );
  },
} as AutocompleteHandler;
