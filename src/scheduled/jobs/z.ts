import dayjs = require("dayjs");
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";

export default {
  name: "z",
  cron: "0 0 1 * *",
  async run() {
    await prisma.z.updateMany({
      data: {
        hasInvite: true,
      },
    });
  },
} satisfies Job;
