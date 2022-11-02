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
      interval: "at 3:00am",
    },
    {
      name: "topglobal",
      interval: "at 12:00am",
    },
    {
      name: "oldguilds",
      interval: "at 3:02am",
      worker: {
        workerData: {
          guilds: [],
        },
      },
    },
    {
      name: "deterioratekarma",
      interval: "at 3:00am",
    },
    {
      name: "lotterytickets",
      timeout: dayjs().add(1, "hour").set("minutes", 25).set("seconds", 0).diff(dayjs(), "milliseconds"),
      interval: "30m",
    },
    {
      name: "cleanmentions",
      interval: "at 12:00am",
    },
    {
      name: "topcommands",
      interval: "at 12:00am",
    },
    {
      name: "dailystreak",
      interval: "at 12:00am",
    },
    {
      name: "resetsuggestions",
      interval: "at 12:00am",
    },
    {
      name: "votereminders",
      timeout: dayjs().add(1, "hour").set("minutes", 25).set("seconds", 0).diff(dayjs(), "milliseconds"),
      interval: "30m",
    },
    {
      name: "cleanlogs",
      interval: "on the first day of the month",
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
