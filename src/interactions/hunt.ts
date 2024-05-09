import { NypsiCommandInteraction } from "../models/Command";
import { InteractionHandler } from "../types/InteractionHandler";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { runCommand } from "../utils/handlers/commandhandler";

export default {
  name: "hunt",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (!interaction.channel.permissionsFor(interaction.user.id).has("SendMessages")) return;

    const int = interaction as unknown as NypsiCommandInteraction;

    int.author = interaction.user;
    int.commandName = "hunt";

    setTimeout(() => {
      if (interaction.isRepliable()) {
        interaction.deferReply().catch(() => {});
      }
    }, 2500);

    return runCommand("hunt", int, []);
  },
} as InteractionHandler;
