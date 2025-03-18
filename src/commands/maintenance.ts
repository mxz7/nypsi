import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { randomPresence } from "../utils/functions/presence";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("maintenance", "maintenance", "none").setPermissions(["bot owner"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

  if ((await redis.get("nypsi:maintenance")) == "t") {
    await redis.del("nypsi:maintenance");

    const presence = await randomPresence();

    (message.client as NypsiClient).cluster.broadcastEval(
      (c, { presence }) => {
        c.user.setPresence({
          status: "online",
          activities: [presence],
        });
      },
      { context: { presence } },
    );
  } else {
    await redis.set("nypsi:maintenance", "t");

    (message.client as NypsiClient).cluster.broadcastEval((c) => {
      c.user.setPresence({
        status: "idle",
        activities: [
          {
            type: 4,
            name: "boobies",
            state: "⚠️ maintenance",
          },
        ],
      });
    });
  }

  if (!(message instanceof Message)) return;

  return message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
