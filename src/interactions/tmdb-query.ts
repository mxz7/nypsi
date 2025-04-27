import { AutocompleteHandler } from "../types/InteractionHandler";
import { movieSearch, tvSearch } from "../utils/functions/tmdb";
import { logger } from "../utils/logger";

export default {
  name: "tmdb-query",
  type: "autocomplete",
  async run(interaction) {
    const type = interaction.options.getSubcommand();

    if (type === "movie") {
      const results = await movieSearch(interaction.options.getFocused(true).value);

      if (results === "unavailable") return;
      if (typeof results === "number") return;

      return interaction
        .respond(
          results.results.slice(0, 10).map((r) => ({
            name: `${r.title} (${new Date(r.release_date).getFullYear()})`,
            value: r.id.toString(),
          })),
        )
        .catch(() => {
          logger.warn(`failed to respond to autocomplete in time`, {
            userId: interaction.user.id,
            command: interaction.commandName,
          });
        });
    } else if (type === "tv") {
      const results = await tvSearch(interaction.options.getFocused(true).value);

      if (results === "unavailable") return;
      if (typeof results === "number") return;

      return interaction
        .respond(
          results.results.slice(0, 10).map((r) => ({
            name: `${r.name} (${new Date(r.first_air_date).getFullYear()})`,
            value: r.id.toString(),
          })),
        )
        .catch(() => {
          logger.warn(`failed to respond to autocomplete in time`, {
            userId: interaction.user.id,
            command: interaction.commandName,
          });
        });
    }
  },
} as AutocompleteHandler;
