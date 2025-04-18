import { AutocompleteHandler } from "../types/InteractionHandler";
import { movieSearch, tvSearch } from "../utils/functions/tmdb";

export default {
  name: "tmdb-query",
  type: "autocomplete",
  async run(interaction) {
    const type = interaction.options.getSubcommand();

    if (type === "movie") {
      const results = await movieSearch(interaction.options.getFocused(true).value);

      if (results === "unavailable") return;
      if (typeof results === "number") return;

      return interaction.respond(
        results.results.slice(0, 10).map((r) => ({
          name: `${r.title} (${new Date(r.release_date).getFullYear()})`,
          value: r.id.toString(),
        })),
      );
    } else if (type === "tv") {
      const results = await tvSearch(interaction.options.getFocused(true).value);

      if (results === "unavailable") return;
      if (typeof results === "number") return;

      return interaction.respond(
        results.results.slice(0, 10).map((r) => ({
          name: `${r.name} (${new Date(r.first_air_date).getFullYear()})`,
          value: r.id.toString(),
        })),
      );
    } else {
      return;
    }
  },
} as AutocompleteHandler;
