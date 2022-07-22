import { ShardingManager } from "discord.js";
import "dotenv/config";
import startJobs from "./utils/scheduled/scheduler";
// import { listenForVotes } from "./utils/votehandler";

const manager = new ShardingManager(`${__dirname}/nypsi.js`, {
    token: process.env.BOT_TOKEN,
    totalShards: 2,
});

manager.on("shardCreate", (shard) => console.log(`launched shard ${shard.id}`));

manager.spawn();

// listenForVotes();
startJobs();
