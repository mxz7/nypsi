import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { setCustomPresence } from "../utils/functions/presence";
import { startRestart } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";

const cmd = new Command("restart", "restart", "none").setPermissions(["bot owner"]);

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

    const client = message.client as NypsiClient;

    client.cluster.broadcastEval((c) => {
      c.user.setPresence({
        activities: [
          {
            name: "rebooting..",
          },
        ],
      });
    });

    await redis.set(Constants.redis.nypsi.RESTART, "t");
    logger.info("starting graceful restart..");

    client.cluster.send("restart");

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ all clusters will be restarted soon")],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
