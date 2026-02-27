import { Cluster } from "discord-hybrid-sharding";
import { WebhookClient } from "discord.js";
import redis from "../../init/redis";
import Constants from "../Constants";
import { logger } from "../logger";
import { dmQueueWorker } from "../queues/dms";

const failedHeartbeats = new Map<number, number>();
const webhook = new WebhookClient({ url: process.env.NYPSI_DYING_HOOK });

export async function sendHeartbeat(cluster: Cluster) {
  if ((await redis.get(`${Constants.redis.nypsi.RESTART}:${cluster.id}`)) == "t") {
    return true;
  }

  return new Promise((resolve, reject) => {
    setImmediate(async () => {
      const res: any = await cluster.request({ alive: true });

      if (res.alive) {
        resolve(true);
      }
    });
    setTimeout(() => {
      reject("no response from cluster");
    }, 5000);
  });
}

export async function addFailedHeartbeat(cluster: Cluster) {
  if (failedHeartbeats.has(cluster.id)) {
    if (failedHeartbeats.get(cluster.id) >= 5) {
      logger.info(`respawning cluster ${cluster.id} due to missing heartbeats`);
      webhook.send({
        content: `respawning cluster ${cluster.id} due to missing heartbeats <@&${Constants.STAFF_ROLE_ID}>`,
      });
      await dmQueueWorker.pause();
      await cluster.respawn().then((c) => {
        webhook.send({
          content: `cluster ${cluster.id} respawned <@&${Constants.STAFF_ROLE_ID}>`,
        });
        logger.debug(`${cluster.id} respawn promise resolved, sending ready event`);
        c.emit("ready");
        logger.debug(`${cluster.id} ready event sent`);
      });
      dmQueueWorker.resume();
      failedHeartbeats.delete(cluster.id);
    } else {
      failedHeartbeats.set(cluster.id, failedHeartbeats.get(cluster.id) + 1);
    }
  } else {
    failedHeartbeats.set(cluster.id, 1);
  }

  const count = failedHeartbeats.get(cluster.id);

  webhook.send({
    content: `cluster ${cluster.id} missed heartbeat (${count}) <@&${Constants.STAFF_ROLE_ID}>`,
  });
}

setInterval(() => {
  failedHeartbeats.clear();
}, 600000);
