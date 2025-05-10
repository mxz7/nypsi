import ms = require("ms");
import pAll = require("p-all");
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { updateChannel } from "../../utils/functions/guilds/counters";

export default {
  name: "counters",
  cron: "*/10 * * * *",
  async run(log, manager) {
    const counters = await prisma.guildCounter.findMany();

    const functions = [];

    for (const counter of counters) {
      if (!counter.format.includes("%value%"))
        await prisma.guildCounter.delete({ where: { channel: counter.channel } });
      functions.push(async () => {
        await updateChannel(counter, manager);
      });
    }

    await pAll(functions, { concurrency: 5 });
  },
} satisfies Job;
