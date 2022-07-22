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
