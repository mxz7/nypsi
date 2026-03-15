import { AutocompleteHandler } from "../types/InteractionHandler";
import { getInventory } from "../utils/functions/economy/inventory";
import { getMuseum } from "../utils/functions/economy/museum";
import { getItems } from "../utils/functions/economy/utils";

export default {
  name: "museum-item",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const items = getItems();

    const [inventory, museum] = await Promise.all([
      getInventory(interaction.member),
      getMuseum(interaction.member),
    ]);

    let options = Object.values(inventory.entries)
      .filter((i) => {
        const item = items[i.item];

        if (!item.museum || (museum.completed(item) && item.museum.no_overflow)) return false;

        return (
          item.id.includes(focused.value) ||
          item.name.includes(focused.value) ||
          item.aliases?.includes(focused.value)
        );
      })
      .map((i) => i.item);

    if (options.length > 25) options = options.splice(0, 24);

    if (options.length == 0) return interaction.respond([]);

    const formatted = options.map((i) => ({
      name: `${
        items[i].emoji.startsWith("<:") ||
        items[i].emoji.startsWith("<a:") ||
        items[i].emoji.startsWith(":")
          ? ""
          : `${items[i].emoji} `
      }${items[i].name} (${items[i].museum.no_overflow ? Math.min(inventory.count(i), items[i].museum.threshold - museum.count(i)).toLocaleString() : inventory.count(i).toLocaleString()} available)`,
      value: i,
    }));

    return await interaction.respond(formatted);
  },
} as AutocompleteHandler;
