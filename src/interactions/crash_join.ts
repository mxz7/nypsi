import { MessageFlags } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { addCrashPlayer } from "../utils/functions/economy/crash";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";

export default {
  name: "crash-join",
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
      return interaction.reply({ embeds: [new ErrorEmbed("nypsi is rebooting")], flags: MessageFlags.Ephemeral });
    }

    if (await redis.get("nypsi:maintenance")) {
      return interaction.reply({
        embeds: [
          new CustomEmbed(
            this.member,
            "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
          ).setTitle("⚠️ nypsi is under maintenance"),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await addCrashPlayer(interaction);
  },
} as InteractionHandler;
