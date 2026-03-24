import {
  AutocompleteInteraction,
  ButtonInteraction,
  CacheType,
  ChannelSelectMenuInteraction,
  InteractionCollector,
  MentionableSelectMenuInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from "discord.js";

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

export type MessageComponentCollector = InteractionCollector<
  | ButtonInteraction<CacheType>
  | StringSelectMenuInteraction<CacheType>
  | UserSelectMenuInteraction<CacheType>
  | RoleSelectMenuInteraction<CacheType>
  | MentionableSelectMenuInteraction<CacheType>
  | ChannelSelectMenuInteraction<CacheType>
  | ModalSubmitInteraction<CacheType>
>;
