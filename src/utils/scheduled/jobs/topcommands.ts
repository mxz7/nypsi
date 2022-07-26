import { EmbedBuilder, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { parentPort } from "worker_threads";
import redis from "../../database/redis";

(async () => {
    const topCommands = await redis.hgetall("nypsi:topcommands");
    await redis.del("nypsi:topcommands");

    const commands: string[] = [];

    for (const cmd of Object.keys(topCommands)) {
        commands.push(cmd);
    }

    inPlaceSort(commands).desc((i) => parseInt(topCommands[i]));

    const msg: string[] = [];

    let count = 0;
    for (const cmd of commands) {
        if (count >= 10) break;

        let pos: number | string = count + 1;

        if (pos == 1) {
            pos = "🥇";
        } else if (pos == 2) {
            pos = "🥈";
        } else if (pos == 3) {
            pos = "🥉";
        }

        msg.push(`${pos} \`$${cmd}\` used **${topCommands[cmd]}** times`);
        count++;
    }

    const embed = new EmbedBuilder();

    embed.setTitle("top 10 commands");
    embed.setDescription(msg.join("\n"));
    embed.setColor("#111111");

    const hook = new WebhookClient({ url: process.env.TOPCOMMANDS_HOOK });

    await hook
        .send({ embeds: [embed] })
        .then(() => {
            parentPort.postMessage("sent top commands");
            process.exit(0);
        })
        .catch(() => {
            parentPort.postMessage("failed to send top commands");
            process.exit(1);
        });
})();
