import { AutocompleteInteraction, MessageComponentInteraction } from "discord.js";

export type InteractionHandler = {
  name: string;
  type: "interaction";
  run: (interaction: MessageComponentInteraction) => Promise<any>;
};

export type AutocompleteHandler = {
  name: string;
  type: "autocomplete";
  run: (interaction: AutocompleteInteraction) => Promise<any>;
};
