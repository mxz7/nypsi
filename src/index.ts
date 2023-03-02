import * as Cluster from "discord-hybrid-sharding";
import { ClusterManager } from "discord-hybrid-sharding";
import "dotenv/config";
import { clearInterval } from "timers";
import redis from "./init/redis";
import startJobs from "./scheduled/scheduler";
import Constants from "./utils/Constants";
import { addFailedHeatbeat, sendHeartbeat } from "./utils/functions/heartbeat";
import { updateStats } from "./utils/functions/topgg";
import { getVersion } from "./utils/functions/version";
import { listenForDms } from "./utils/handlers/notificationhandler";
import { listen } from "./utils/handlers/webhookhandler";
import { getWebhooks, logger, setClusterId } from "./utils/logger";
import ms = require("ms");

setClusterId("main");
getWebhooks();
process.title = `nypsi v${getVersion()}: main`;

let heartBeatIntervals: NodeJS.Timer[] = [];

const manager = new ClusterManager(`${__dirname}/nypsi.js`, {
  token: process.env.BOT_TOKEN,

  execArgv: ["--trace-warnings"],
  shardArgs: ["--ansi", "--color"],

  restarts: {
    max: 10,
    interval: ms("1 hour"),
  },

  // totalShards: 6,
  shardsPerClusters: 3, // force clusters
  spawnOptions: {
    delay: 0,
  },
});

manager.extend(new Cluster.ReClusterManager());

manager.on("clusterCreate", (cluster) => {
  cluster.on("ready", () => {
    logger.info(`cluster ${cluster.id} ready`);

    setTimeout(() => {
      const interval = setInterval(async () => {
        const heartbeat = await sendHeartbeat(cluster).catch(() => {});

        if (!heartbeat) {
          logger.warn(`cluster ${cluster.id} missed heartbeat`);
          addFailedHeatbeat(cluster);
        }
      }, 25000);
      heartBeatIntervals.push(interval);
    }, 10000);
  });
  cluster.on("death", () => {
    logger.info(`cluster ${cluster.id} died`);
  });
  cluster.on("disconnect", () => {
    logger.info(`cluster ${cluster.id} disconnected. respawning..`);
    cluster.respawn();
  });
  cluster.on("reconnecting", () => {
    logger.info(`cluster ${cluster.id} reconnecting..`);
  });
  cluster.on("message", (message) => {
    if (message == "restart") {
      manager.recluster.start({ restartMode: "gracefulSwitch" });
      heartBeatIntervals.forEach((i) => clearInterval(i));
      heartBeatIntervals = [];
    }
  });
  logger.info(`launched cluster ${cluster.id}`);
});

manager.on("debug", (m) => {
  logger.debug(m);
});

process.on("unhandledRejection", (e: any) => {
  logger.error(e.message, e);
});

process.on("uncaughtException", (e) => {
  logger.error(e.message, e);
});

manager.spawn();

export async function getGuilds(): Promise<string[]> {
  const guildIds = await manager.broadcastEval((c) => {
    return c.guilds.cache.map((g) => g.id);
  });

  const newGuildIds: string[] = [];

  for (const shardResponse of guildIds) {
    shardResponse.forEach((id) => newGuildIds.push(id));
  }

  return newGuildIds;
}

listen(manager);

setTimeout(async () => {
  await startJobs();
  listenForDms(manager);
  logger.info("jobs triggered");
}, 300000);
// }, 15000);

setTimeout(async () => {
  const userId = await manager.fetchClientValues("user.id");

  if (userId[0] != Constants.BOT_USER_ID) return;

  const guildCount = (await manager
    .fetchClientValues("guilds.cache.size")
    .then((res) => res.reduce((a: any, b: any) => a + b))) as number;

  const shardCount = manager.clusterList.length;

  setInterval(() => {
    updateStats(guildCount, shardCount);
    logger.info(`::guild guild count posted to top.gg: ${guildCount}`);
  }, 3600000);

  updateStats(guildCount, shardCount);
  logger.info(`::guild guild count posted to top.gg: ${guildCount}`);
}, 60000);

setInterval(async () => {
  const queries = await redis.lrange(Constants.redis.nypsi.HOURLY_DB_REPORT, 0, -1);
  await redis.del(Constants.redis.nypsi.HOURLY_DB_REPORT);

  const total = parseInt(queries.reduce((a, b) => (parseInt(a) + parseInt(b)).toString()));
  const avg = Math.floor(total / queries.length);

  logger.info(`average query takes ${avg}ms (${total.toLocaleString()} queries in the last hour)`);
}, ms("1 hour"));
