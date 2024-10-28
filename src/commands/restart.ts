import { CommandInteraction } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getCrashStatus } from "../utils/functions/economy/crash";
import { setCustomPresence } from "../utils/functions/presence";
import { startRestart } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";

const cmd = new Command("restart", "restart", "none").setPermissions(["bot owner"]);

let confirm = false;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

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
        status: "dnd",
        activities: [
          {
            type: 4,
            name: "rebooting..",
          },
        ],
      });
    });

    await message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ all clusters will be restarted soon")],
    });

    logger.info("awaiting for inactivity");

    const check = setInterval(async () => {
      const thingy = await redis.scard(Constants.redis.nypsi.USERS_PLAYING);
      const crashStatus = await getCrashStatus();

      if (thingy == 0 && crashStatus.state === "waiting" && crashStatus.players.length === 0) {
        for (let i = 0; i < (message.client as NypsiClient).cluster.count; i++) {
          await redis.set(`${Constants.redis.nypsi.RESTART}:${i}`, "t");
        }
        logger.info("starting graceful restart..");

        clearInterval(check);
        client.cluster.send("restart");
      }
    }, 1000);
  }
}

cmd.setRun(run);

module.exports = cmd;
