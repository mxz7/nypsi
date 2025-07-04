import { CommandInteraction, Message } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { randomPresence } from "../utils/functions/presence";
import { getAdminLevel } from "../utils/functions/users/admin";
import dayjs = require("dayjs");

const cmd = new Command("maintenance", "maintenance", "none").setPermissions(["bot owner"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.member)) < 3) return;

  if (await redis.exists("nypsi:maintenance")) {
    const before = await redis.get("nypsi:maintenance");
    await redis.del("nypsi:maintenance");

    if (parseInt(before)) {
      const total = Date.now() - parseInt(before);

      const boosters = await prisma.booster.findMany({
        select: {
          id: true,
          expire: true,
        },
      });

      for (const booster of boosters) {
        await prisma.booster.update({
          where: {
            id: booster.id,
          },
          data: {
            expire: dayjs(booster.expire).add(total, "millisecond").toDate(),
          },
        });
      }
    }

    const presence = await randomPresence();

    (message.client as NypsiClient).cluster.send("maintenance_off");
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
    await redis.set("nypsi:maintenance", Date.now());

    (message.client as NypsiClient).cluster.send("maintenance_on");
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
