import type { AutocompleteHandler } from "../types/InteractionHandler";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItemUseDefinition } from "../utils/functions/economy/item-use";
import { getItems } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

export default {
  name: "use:item",
  type: "autocomplete",
  async run(interaction) {
    const search = interaction.options.getFocused().toLowerCase();
    const inventory = await getInventory(interaction.user.id);
    if (!inventory) return interaction.respond([]);

    const items = getItems();
    const matches = inventory.entries
      .map((entry) => items[entry.item])
      .filter(
        (item) =>
          item &&
          !item.hidden &&
          inventory.count(item.id) > 0 &&
          [item.id, item.name, item.plural, ...(item.aliases ?? [])].some((name) =>
            name?.toLowerCase().includes(search),
          ),
      );
    const usable = await Promise.all(
      matches.map(async (item) => ({ item, definition: await getItemUseDefinition(item) })),
    );
    const choices = usable
      .filter(({ definition }) => definition && definition.options.suggest !== false)
      .slice(0, 25)
      .map(({ item }) => ({
        name: `${item.emoji.startsWith("<") || item.emoji.startsWith(":") ? "" : `${item.emoji} `}${item.name} [${inventory.count(item.id).toLocaleString()}]`.slice(
          0,
          100,
        ),
        value: item.id,
      }));

    return interaction.respond(choices).catch((error) => {
      logger.warn("item use: failed to respond to autocomplete", {
        userId: interaction.user.id,
        error,
      });
    });
  },
} satisfies AutocompleteHandler;
