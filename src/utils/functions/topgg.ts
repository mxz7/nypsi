import * as topgg from "@top-gg/sdk";

const topggStats = new topgg.Api(process.env.TOPGG_TOKEN);

export function updateStats(guildCount: number, shardCount: number) {
    topggStats.postStats({
        serverCount: guildCount,
        shardCount: shardCount,
    });

    // fetch("https://discord.bots.gg/bots/678711738845102087/stats", {
    //     method: "POST",
    //     body: JSON.stringify({ shardCount: shardCount, guildCount: guildCount }),
    //     headers: { "Content-Type": "application/json", "Authorization": "removed token" }
    // }) FOR POSTING TO DISCORD.BOTS.GG
}
