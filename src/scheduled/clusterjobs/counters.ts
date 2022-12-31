import ms = require("ms");
import pAll = require("p-all");
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { updateChannel } from "../../utils/functions/guilds/counters";

export async function updateCounters(client: NypsiClient) {
  setInterval(async () => {
    const counters = await prisma.guildCounter.findMany();

    const functions = [];

    for (const counter of counters) {
      if (!counter.format.includes("%value%")) await prisma.guildCounter.delete({ where: { channel: counter.channel } });
      functions.push(async () => {
        updateChannel(counter, client);
      });
    }

    pAll(functions, { concurrency: 5 });
  }, ms("10 minutes"));
}
