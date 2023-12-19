import * as Cluster from "discord-hybrid-sharding";
import { ClusterManager } from "discord-hybrid-sharding";
import "dotenv/config";
import { clearInterval } from "timers";
import redis from "./init/redis";
import { loadJobs, runJob } from "./scheduled/scheduler";
import Constants from "./utils/Constants";
import { addFailedHeartbeat, sendHeartbeat } from "./utils/functions/heartbeat";
import { updateStats } from "./utils/functions/topgg";
import { getVersion } from "./utils/functions/version";
import { startMentionInterval } from "./utils/handlers/mentions";
import { listenForDms } from "./utils/handlers/notificationhandler";
import { listen } from "./utils/handlers/webhookhandler";
import { getWebhooks, logger, setClusterId } from "./utils/logger";
import ms = require("ms");

setClusterId("main");
getWebhooks();
process.title = `nypsi v${getVersion()}: main`;

let heartBeatIntervals: NodeJS.Timeout[] = [];

const manager = new ClusterManager(`${__dirname}/nypsi.js`, {
  token: process.env.BOT_TOKEN,

  execArgv: ["--trace-warnings"],
  shardArgs: ["--ansi", "--color"],

  restarts: {
    max: 10,
    interval: ms("1 hour"),
  },

  // totalShards: 6,
  // shardsPerClusters: 3, // force clusters
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
          addFailedHeartbeat(cluster);
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
      manager.recluster.start({ restartMode: "rolling", delay: 2500 });
      heartBeatIntervals.forEach((i) => clearInterval(i));
      heartBeatIntervals = [];
    } else if (typeof message === "string" && message.startsWith("trigger_job")) {
      return runJob(message.split("trigger_job_")[1]);
    } else if (typeof message === "string" && message === "reload_jobs") {
      return loadJobs();
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

listen(manager);

setTimeout(async () => {
  listenForDms(manager);
  startMentionInterval();
}, 300000);
// }, 15000);

setTimeout(async () => {
  const userId = await manager.fetchClientValues("user.id");

  if (userId[0] != Constants.BOT_USER_ID) return;

  setInterval(async () => {
    const guildCount = await manager
      .fetchClientValues("guilds.cache.size")
      .then((res: number[]) => res.reduce((a, b) => a + b));

    const shardCount = manager.clusters.size;

    updateStats(guildCount, shardCount);
    logger.info(`::guild guild count posted to top.gg: ${guildCount}`);
  }, 3600000);

  const guildCount = await manager
    .fetchClientValues("guilds.cache.size")
    .then((res: number[]) => res.reduce((a, b) => a + b));

  const shardCount = manager.clusterList.length;

  updateStats(guildCount, shardCount);
  logger.info(`::guild guild count posted to top.gg: ${guildCount}`);
}, 60000);

setInterval(async () => {
  const queries = await redis.lrange(Constants.redis.nypsi.HOURLY_DB_REPORT, 0, -1);
  await redis.del(Constants.redis.nypsi.HOURLY_DB_REPORT);

  const total = parseInt(queries.reduce((a, b) => (parseInt(a) + parseInt(b)).toString()));
  const avg = (total / queries.length).toFixed(2);

  logger.info(`average query takes ${avg}ms (${total.toLocaleString()} queries in the last hour)`);
}, ms("1 hour"));

export async function checkStatus() {
  async function checkCluster(
    cluster: Cluster.Cluster,
  ): Promise<{ online: boolean; responsive: boolean; id: number }> {
    return new Promise((resolve) => {
      let response: {
        responsive: boolean;
        online: boolean;
        id: number;
        guilds: { id: string; shard: number }[];
        shards: { id: number; ping: number; status: number; lastPing: number }[];
      } = {
        responsive: false,
        online: false,
        id: cluster.id,
        guilds: [],
        shards: [],
      };

      setTimeout(() => {
        resolve(response);
      }, 2000);

      cluster.request({ alive: true }).then((res: any) => {
        if (res.alive) {
          response.online = true;

          cluster.request({ responsive: true }).then((res: any) => {
            if (res.responsive) {
              response = { ...response, ...res };
            }
            resolve(response);
          });
        }
      });
    });
  }

  const response: {
    main: boolean;
    maintenance: boolean;
    uptime: number;
    clusters: { online: boolean; responsive: boolean; id: number }[];
  } = {
    main: true,
    maintenance: (await redis.get("nypsi:maintenance")) == "t",
    clusters: [],
    uptime: Math.floor(process.uptime() * 1000),
  };

  const promises = [];

  for (const cluster of manager.clusters.values()) {
    promises.push(checkCluster(cluster));
  }

  await Promise.all(promises).then((r) => (response.clusters = r));

  return response;
}

loadJobs();

export { manager };
