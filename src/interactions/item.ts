import { AutocompleteHandler } from "../types/InteractionHandler";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";

export default {
  name: "item",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const inventory = await getInventory(interaction.user.id);

    if (!inventory) return;

    const items = getItems();

    let options = inventory
      .map((i) => i.item)
      .filter(
        (item) =>
          item.includes(focused.value) ||
          items[item].name.includes(focused.value) ||
          items[item].aliases?.includes(focused.value)
      );

    if (options.length > 25) options = options.splice(0, 24);

    if (options.length == 0) return interaction.respond([]);

    const formatted = options.map((i) => ({
      name: `${
        items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
          ? ""
          : `${items[i].emoji} `
      }${items[i].name} [${inventory.find((x) => x.item == i).amount.toLocaleString()}]`,
      value: i,
    }));

    return await interaction.respond(formatted);
  },
} as AutocompleteHandler;
