import { Cluster } from "discord-hybrid-sharding";
import { logger } from "../logger";

const failedHeartbeats = new Map<number, number>();

export async function sendHeartbeat(cluster: Cluster) {
    return new Promise((resolve, reject) => {
        setImmediate(async () => {
            const res: any = await cluster.request({ alive: true });

            if (res.alive) {
                resolve(true);
            }
        });
        setTimeout(() => {
            reject("no response from cluster");
        }, 2500);
    });
}

export function addFailedHeatbeat(cluster: Cluster) {
    if (failedHeartbeats.has(cluster.id)) {
        if (failedHeartbeats.get(cluster.id) >= 5) {
            logger.info(`respawning cluster ${cluster.id} due to missing heart beats`);
            cluster.respawn();
            failedHeartbeats.delete(cluster.id);
        } else {
            failedHeartbeats.set(cluster.id, failedHeartbeats.get(cluster.id) + 1);
        }
    } else {
        failedHeartbeats.set(cluster.id, 1);
    }
}

setInterval(() => {
    failedHeartbeats.clear();
}, 600000);
