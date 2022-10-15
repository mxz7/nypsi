import Bree = require("bree");
import dayjs = require("dayjs");
import ms = require("ms");
import path = require("path");
import { getGuilds } from "../..";
import { logger } from "../logger";

const bree = new Bree({
  root: path.resolve("./jobs"),
  logger: false,

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
      name: "purge-usernames",
      interval: "at 3:00am",
      path: path.join(__dirname, "jobs", "purgeusernames.js"),
    },
    {
      name: "top-global",
      interval: "at 12:00am",
      path: path.join(__dirname, "jobs", "topglobal.js"),
    },
    {
      name: "delete-guilds",
      interval: "at 3:01am",
      path: path.join(__dirname, "jobs", "oldguilds.js"),
      worker: {
        workerData: {
          guilds: [],
        },
      },
    },
    {
      name: "deteriorate-karma",
      interval: "at 3:02am",
      path: path.join(__dirname, "jobs", "deterioratekarma.js"),
    },
    {
      name: "lottery-tickets",
      interval: "30m",
      path: path.join(__dirname, "jobs", "lotterytickets.js"),
    },
    {
      name: "clean-mentions",
      interval: "at 11:59pm",
      path: path.join(__dirname, "jobs", "cleanmentions.js"),
    },
    {
      name: "top-commands",
      interval: "at 12:00am",
      path: path.join(__dirname, "jobs", "topcommands.js"),
    },
    {
      name: "daily-streak",
      interval: "at 11:59pm",
      path: path.join(__dirname, "jobs", "dailystreak.js"),
    },
    {
      name: "reset-suggestions",
      interval: "at 12:00am",
      path: path.join(__dirname, "jobs", "resetsuggestions.js"),
    },
    {
      name: "vote-reminders",
      timeout: dayjs().add(1, "hour").set("minutes", 30).set("seconds", 0).diff(dayjs(), "milliseconds"),
      interval: "30m",
      path: path.join(__dirname, "jobs", "votereminders.js"),
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
