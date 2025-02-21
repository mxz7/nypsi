import Constants from "../Constants";

export function updateStats(guildCount: number, shardCount: number) {
  fetch(`https://top.gg/api/bots/${Constants.BOT_USER_ID}/stats`, {
    headers: {
      authorization: process.env.TOPGG_TOKEN,
    },
    body: JSON.stringify({ server_count: guildCount, shard_count: shardCount }),
  });
}
