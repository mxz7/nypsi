import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { crashOut } from "../utils/functions/economy/crash";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";

export default {
  name: "crash-out",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (!(await userExists(interaction.user.id))) return;

    if (
      (await redis.get(
        `${Constants.redis.nypsi.RESTART}:${(interaction.client as NypsiClient).cluster.id}`,
      )) == "t"
    ) {
      return interaction.reply({ embeds: [new ErrorEmbed("nypsi is rebooting")] });
    }

    await crashOut(interaction);
  },
} as InteractionHandler;
