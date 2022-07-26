import { EmbedBuilder, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { parentPort } from "worker_threads";
import redis from "../../database/redis";

(async () => {
    const topCommands = await redis.hgetall("nypsi:topcommands");
    const topUsers = await redis.hgetall("nypsi:topcommands:user");
    await redis.del("nypsi:topcommands");
    await redis.del("nypsi:topcommands:user");

    const commands: string[] = [];

    for (const cmd of Object.keys(topCommands)) {
        commands.push(cmd);
    }

    const users: string[] = [];

    for (const user of Object.keys(topUsers)) {
        users.push(user);
    }

    inPlaceSort(commands).desc((i) => parseInt(topCommands[i]));
    inPlaceSort(users).desc((i) => parseInt(topUsers[i]));

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
    embed.setFooter({ text: `${users[0]} has no life (${parseInt(topUsers[users[0]]).toLocaleString()} commands)` });

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
