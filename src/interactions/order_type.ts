import { AutocompleteHandler } from "../types/InteractionHandler";

export default {
  name: "order-type",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const formatted = [
      {
        name: "buy order",
        value: "buy",
      },
      {
        name: "sell order",
        value: "sell",
      },
    ];

    return await interaction.respond(formatted);
  },
} as AutocompleteHandler;
