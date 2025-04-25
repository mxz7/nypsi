import prisma from "../init/database";
import { AutocompleteHandler } from "../types/InteractionHandler";
import { getItems } from "../utils/functions/economy/utils";

export default {
  name: "item-market-buy",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const sellOrders = await prisma.marketOrder.findMany({
      where: {
        AND: [{ completed: false }, { orderType: "sell" }],
      },
      orderBy: { createdAt: "asc" },
    });

    const combinedQuantities: { itemId: string; itemAmount: bigint }[] = Object.values(
      sellOrders.reduce<Record<string, { itemId: string; itemAmount: bigint }>>(
        (acc, { itemId, itemAmount }) => {
          if (!acc[itemId]) {
            acc[itemId] = { itemId, itemAmount };
          } else {
            acc[itemId].itemAmount += itemAmount;
          }
          return acc;
        },
        {},
      ),
    );

    if (combinedQuantities.length == 0) return;

    const items = getItems();

    let options = combinedQuantities
      .map((i) => i.itemId)
      .filter(
        (item) =>
          item.includes(focused.value) ||
          items[item].name.includes(focused.value) ||
          items[item].aliases?.includes(focused.value),
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
      }${items[i].name} [${combinedQuantities.find((c) => (c.itemId = i)).itemAmount.toLocaleString()} in sell orders]`,
      value: i,
    }));

    return await interaction.respond(formatted);
  },
} as AutocompleteHandler;
