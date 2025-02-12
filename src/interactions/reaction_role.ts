import { AutocompleteHandler } from "../types/InteractionHandler";
import { getReactionRolesByGuild } from "../utils/functions/guilds/reactionroles";

export default {
  name: "reaction-role",
  type: "autocomplete",
  async run(interaction) {
    const focused = interaction.options.getFocused(true);
    focused.value = focused.value.toLowerCase();

    const reactionRoles = await getReactionRolesByGuild(interaction.guild);

    const filtered = reactionRoles.filter(
      (rr) =>
        rr.messageId.includes(focused.value) ||
        rr.description?.includes(focused.value) ||
        rr.title?.includes(focused.value),
    );

    return interaction.respond(
      filtered.map((rr) => {
        let title = rr.title;

        if (title?.length > 20) title = title.substring(0, 20) + "...";

        return { name: title ? `${title} (${rr.messageId})` : rr.messageId, value: rr.messageId };
      }),
    );
  },
} as AutocompleteHandler;
