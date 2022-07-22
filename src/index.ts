import { ShardingManager } from "discord.js";
import "dotenv/config";
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

    return console.log(userId);

    // setInterval(() => {
    //     updateStats(client.guilds.cache.size, client.options.shardCount);
    //     logger.log({
    //         level: "auto",
    //         message: "guild count posted to top.gg: " + client.guilds.cache.size,
    //     });
    // }, 3600000);

    // updateStats(client.guilds.cache.size, client.options.shardCount);
    // logger.log({
    //     level: "auto",
    //     message: "guild count posted to top.gg: " + client.guilds.cache.size,
    // });
}, 60000);
