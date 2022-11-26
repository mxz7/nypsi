import { inPlaceSort } from "fast-sort";
import fetch from "node-fetch";
import { cpu } from "node-os-utils";
import * as os from "os";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../Constants";
import { logger } from "../logger";
import ms = require("ms");

const KEY = process.env.STATCORD_KEY;
const BASE_URL = "https://api.statcord.com/v3/stats";

export async function postAnalytics(userId: string, serverCount: number) {
  const activeUsers: string[] = await redis.smembers(Constants.redis.nypsi.ACTIVE_USERS_HOURLY);
  const popularCommands: { name: string; count: number }[] = [];
  let commandCount = 0;

  const popularCommandsData = await redis.hgetall(Constants.redis.nypsi.TOP_COMMANDS_HOURLY);

  for (const [cmd, count] of Object.entries(popularCommandsData)) {
    popularCommands.push({ name: cmd, count: parseInt(count) });
    commandCount += parseInt(count);
  }

  await redis.del(Constants.redis.nypsi.TOP_COMMANDS_HOURLY);
  await redis.del(Constants.redis.nypsi.ACTIVE_USERS_HOURLY);

  inPlaceSort(popularCommands).desc((i) => i.count);

  const userCount = await prisma.user.count();
  const totalMem = Math.round(os.totalmem());
  const freeMem = Math.round(os.freemem());
  const memUsage = Math.round(totalMem - freeMem);
  const memUsagePerc = Math.round((memUsage / totalMem) * 100);
  const cpuUsage = await cpu.usage();

  const res = await fetch(`${BASE_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: userId,
      key: KEY,
      servers: serverCount,
      users: userCount,
      active: activeUsers,
      commands: commandCount,
      popular: popularCommands.slice(0, 4),
      memactive: memUsage,
      memload: memUsagePerc,
      cpuload: cpuUsage,
    }),
  }).then((res) => res.json());

  if (res.error) {
    logger.warn(`failed to post analytics. retrying in 5 minutes: ${res.error} ${res.message}`);

    return new Promise((resolve) => {
      setTimeout(async () => {
        const res = await fetch(`${BASE_URL}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: userId,
            key: KEY,
            servers: serverCount,
            users: userCount,
            active: activeUsers,
            commands: commandCount,
            popular: popularCommands.slice(0, 4),
            memactive: memUsage,
            memload: memUsagePerc,
            cpuload: cpuUsage,
          }),
        }).then((res) => res.json());

        if (res.error) {
          logger.error(`failed to post analytics: ${res.error} ${res.message}`);
          return resolve(false);
        }
      }, ms("5 minutes"));

      return resolve(true);
    });
  } else {
    logger.log({
      level: "success",
      message: "sucessfully posted analytics",
    });
    return true;
  }
}
