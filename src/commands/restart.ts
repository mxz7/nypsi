import { CommandInteraction, Message } from "discord.js";
import { startRestart } from "../utils/commandhandler";
import redis from "../utils/database/redis";
import { setCustomPresence } from "../utils/functions/presence";
import { logger } from "../utils/logger";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("restart", "restart", Categories.NONE).setPermissions(["bot owner"]);

let confirm = false;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.member.user.id != "672793821850894347") return;

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

    logger.info("nypsi restarting soon...");

    setTimeout(async () => {
      await redis.set("nypsi:restarting", "t");
      logger.info("starting graceful restart..");

      client.cluster.send("restart");
    }, 10000);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ all clusters will be restarted soon")],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
