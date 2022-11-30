import { inPlaceSort } from "fast-sort";
import fetch from "node-fetch";
import { cpu } from "node-os-utils";
import * as os from "os";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../Constants";
import { logger } from "../logger";

const KEY = process.env.STATCORD_KEY;
const BASE_URL = "https://api.statcord.com/v3/stats";

export async function postAnalytics(userId: string, serverCount: number) {
  const activeUsers: string[] = await redis.smembers(Constants.redis.nypsi.ACTIVE_USERS_ANALYTICS);
  const popularCommands: { name: string; count: number }[] = [];
  let commandCount = 0;

  const popularCommandsData = await redis.hgetall(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS);

  for (const [cmd, count] of Object.entries(popularCommandsData)) {
    popularCommands.push({ name: cmd, count: parseInt(count) });
    commandCount += parseInt(count);
  }

  if (commandCount == 0 || popularCommands.length == 0 || activeUsers.length == 0) {
    logger.info("skipping analytics post due to inactivity");
    return;
  }

  await redis.del(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS);
  await redis.del(Constants.redis.nypsi.ACTIVE_USERS_ANALYTICS);

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
      popular: popularCommands,
      memactive: memUsage,
      memload: memUsagePerc,
      cpuload: cpuUsage,
    }),
  }).then((res) => res.json());

  if (res.wait) {
    logger.warn(`hit analytics rate limit: ${res}`);

    return new Promise((resolve) => {
      setTimeout(async () => {
        const res2 = await fetch(`${BASE_URL}`, {
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

        if (res2.error) {
          logger.error(`failed to post analytics: ${res.message}`);
          return resolve(false);
        }
      }, res.wait);

      return resolve(true);
    });
  }

  if (res.error) {
    logger.warn(`failed to post analytics. retrying in 1 minute: ${res.message}`);

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
        }).then((res) => res.json().catch((e) => logger.error(e)));

        if (res.error) {
          logger.error(`failed to post analytics: ${res.message}`);
          return resolve(false);
        }
      }, 60000);

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
