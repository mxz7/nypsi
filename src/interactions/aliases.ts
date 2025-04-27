import { AutocompleteHandler } from "../types/InteractionHandler";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getUserAliases } from "../utils/functions/premium/aliases";
import { logger } from "../utils/logger";

export default {
  name: "alias",
  type: "autocomplete",
  async run(interaction) {
    const aliases = await getUserAliases(interaction.user.id);

    if (aliases.length == 0) return await interaction.respond([]);

    const prefix = (await getPrefix(interaction.guild))[0];

    const formatted = aliases.map((i) => ({
      name: `${prefix}${i.alias} (${prefix}${i.command})`,
      value: i.alias,
    }));

    return await interaction.respond(formatted).catch(() => {
      logger.warn(`failed to respond to autocomplete in time`, {
        userId: interaction.user.id,
        command: interaction.commandName,
      });
    });
  },
} as AutocompleteHandler;
