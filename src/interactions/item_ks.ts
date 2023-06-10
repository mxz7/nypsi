import { AutocompleteHandler } from "../types/InteractionHandler";
import { getKarma } from "../utils/functions/karma/karma";
import { getKarmaShopItems, isKarmaShopOpen } from "../utils/functions/karma/karmashop";

export default {
  name: "item-karmashop",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    if (!(await isKarmaShopOpen())) return;

    const items = await getKarmaShopItems();
    const karma = await getKarma(interaction.user.id);

    let options = Object.keys(items).filter(
      (item) =>
        (item.includes(focused.value) || items[item].name.includes(focused.value)) &&
        items[item].items_left > 0 &&
        items[item].cost <= karma &&
        items[item].limit > items[item].bought.filter((i) => i === interaction.user.id).length
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

    return await interaction.respond(formatted);
  },
} as AutocompleteHandler;
