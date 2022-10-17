import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import { startRestart } from "../utils/commandhandler";
import Constants from "../utils/Constants";
import { setCustomPresence } from "../utils/functions/presence";
import { logger } from "../utils/logger";

const cmd = new Command("restartcluster", "restartcluster", Categories.NONE).setPermissions(["bot owner"]);

let confirm = false;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (confirm == false) {
    confirm = true;
    setTimeout(() => {
      confirm = false;
    }, 120000);
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "run command again to confirm")],
    });
  } else {
    startRestart();

    await setCustomPresence("rebooting..");

    message.client.user.setPresence({
      activities: [
        {
          name: "rebooting..",
        },
      ],
    });

    logger.info("cluster shutting down soon...");

    setTimeout(() => {
      logger.info("cluster shutting down in 10 seconds...");

      setTimeout(() => {
        logger.info("cluster shutting down...");
        const client = message.client as NypsiClient;

        client.cluster.evalOnManager(`this.clusters.get(${client.cluster.id}).respawn()`);
      }, 10000);
    }, 20000);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ current cluster will shut down soon")],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
