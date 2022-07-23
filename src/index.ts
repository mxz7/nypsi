import * as Cluster from "discord-hybrid-sharding";
import "dotenv/config";
import { updateStats } from "./utils/functions/topgg";
import { logger, setClusterId } from "./utils/logger";
import startJobs from "./utils/scheduled/scheduler";
import { listenForVotes } from "./utils/votehandler";

setClusterId("main");

const manager = new Cluster.Manager(`${__dirname}/nypsi.js`, {
    token: process.env.BOT_TOKEN,

    execArgv: ["--trace-warnings"],
    shardArgs: ["--ansi", "--color"],

    keepAlive: {
        interval: 10000,
        maxMissedHeartbeats: 2,
    },
});

manager.extend(
    new Cluster.HeartbeatManager({
        interval: 2000,
        maxMissedHeartbeats: 5,
    })
);

manager.on("clusterCreate", (cluster) => {
    logger.info(`launched cluster ${cluster.id}`);
});

manager.on("debug", (m) => {
    logger.debug(m);
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

listenForVotes(manager);

setTimeout(async () => {
    await startJobs();
    logger.info("jobs triggered");
}, 60000);

setTimeout(async () => {
    const userId = await manager.fetchClientValues("user.id");

    if (userId[0] != "678711738845102087") return;

    const guildCount = (await manager
        .fetchClientValues("guilds.cache.size")
        .then((res) => res.reduce((a: any, b: any) => a + b))) as number;

    const shardCount = manager.clusterList.length;

    setInterval(() => {
        updateStats(guildCount, shardCount);
        logger.log({
            level: "auto",
            message: "guild count posted to top.gg: " + guildCount,
        });
    }, 3600000);

    updateStats(guildCount, shardCount);
    logger.log({
        level: "auto",
        message: "guild count posted to top.gg: " + guildCount,
    });
}, 60000);
