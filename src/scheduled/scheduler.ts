import Bree = require("bree");
import dayjs = require("dayjs");
import ms = require("ms");
import path = require("path");
import { getGuilds } from "..";
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
    {
      name: "purgeguilds",
      interval: "at 3:02am",
      worker: {
        workerData: {
          guilds: [],
        },
      },
    },
    {
      name: "deterioratekarma",
      interval: "at 11:51pm",
    },
    {
      name: "lotterytickets",
      timeout: dayjs().add(1, "hour").set("minutes", 25).set("seconds", 0).diff(dayjs(), "milliseconds"),
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
      interval: "at 11:55pm",
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
      timeout: dayjs().add(1, "hour").set("minutes", 10).set("seconds", 0).diff(dayjs(), "milliseconds"),
      interval: "15m",
    },
    {
      name: "purgelogs",
      interval: "on the first day of the month",
    },
    {
      name: "purgeusers",
      cron: "0 1 * * 1",
    },
  ],
});

export default async function startJobs() {
  await bree.start();

  bree.config.jobs[2].worker.workerData.guilds = await getGuilds();

  // await bree.run();

  setInterval(async () => {
    bree.config.jobs[2].worker.workerData.guilds = await getGuilds();
  }, ms("1 day"));
}
