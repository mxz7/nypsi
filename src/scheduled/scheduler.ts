import Bree = require("bree");
import dayjs = require("dayjs");
import path = require("path");
import { logger } from "../utils/logger";

const bree = new Bree({
  root: path.join(__dirname, "jobs"),
  logger: logger,

  workerMessageHandler: (message) => {
    if (message.message) {
      logger.info(`[${message.name}] ${message.message}`);
    }
  },
  errorHandler: (message) => {
    logger.error(`[${message.name}] ${message.message}`);
  },

  jobs: [
    {
      name: "purgeusernames",
      interval: "at 12:30am",
    },
    {
      name: "topglobal",
      interval: "at 12:00am",
    },
    // {
    //   name: "purgeguilds",
    //   interval: "at 3:02am",
    //   worker: {
    //     workerData: {
    //       guilds: [],
    //     },
    //   },
    // },
    {
      name: "deterioratekarma",
      interval: "at 11:51pm",
    },
    {
      name: "lotterytickets",
      timeout: dayjs()
        .add(1, "hour")
        .set("minutes", 25)
        .set("seconds", 0)
        .diff(dayjs(), "milliseconds"),
      interval: "30m",
    },
    {
      name: "purgementions",
      interval: "at 11:50pm",
    },
    {
      name: "topcommands",
      interval: "at 12:00am",
    },
    {
      name: "dailystreak",
      interval: "at 11:50pm",
    },
    {
      name: "resetsuggestions",
      interval: "at 11:55pm",
    },
    {
      name: "purgerolepersist",
      interval: "at 11:55pm",
    },
    {
      name: "votereminders",
      timeout: dayjs()
        .add(1, "hour")
        .set("minutes", 10)
        .set("seconds", 0)
        .diff(dayjs(), "milliseconds"),
      interval: "15m",
    },
    {
      name: "topsnapshot",
      interval: "at 2:00am",
    },
    {
      name: "purgelogs",
      cron: "0 3 1 * *",
    },
    {
      name: "images",
      interval: "at 1:00am",
    },
  ],
});

export async function startJobs() {
  await bree.start();

  // await bree.run();
}

export function runJob(name: string) {
  return bree.run(name);
}
