import { ShardingManager } from "discord.js";
import "dotenv/config";
import { updateStats } from "./utils/functions/topgg";
import { logger, setClusterId } from "./utils/logger";
import startJobs from "./utils/scheduled/scheduler";
// import { listenForVotes } from "./utils/votehandler";

setClusterId("main");

const manager = new ShardingManager(`${__dirname}/nypsi.js`, {
    token: process.env.BOT_TOKEN,
    totalShards: 2,
});

manager.on("shardCreate", (shard) => {
    logger.info(`launched shard ${shard.id}`);
});

manager.spawn();

// listenForVotes();
startJobs();

setTimeout(async () => {
    const userId = await manager.fetchClientValues("user.id");

    if (userId[0] != "678711738845102087") return;

    const guildCount = (await manager
        .fetchClientValues("guilds.cache.size")
        .then((res) => res.reduce((a: any, b: any) => a + b))) as number;

    const shardCount = manager.shards.size;

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
