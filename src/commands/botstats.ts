import { CommandInteraction, Message } from "discord.js";
import { cpu } from "node-os-utils";
import * as os from "os";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../package.json";
import { workerCount } from "../events/message.js";
import { aliasesSize, commandsSize } from "../utils/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import prisma from "../utils/database/database";
import { MStoTime } from "../utils/functions/date.js";
import { NypsiClient } from "../utils/models/Client";
import { mentionQueue } from "../utils/users/utils.js";

const cmd = new Command("botstats", "view stats for the bot", Categories.INFO);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const systemUptime = MStoTime(os.uptime() * 1000);
    const uptime = MStoTime(message.client.uptime);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const memUsage = Math.round(totalMem - freeMem);
    const cpuUsage = await cpu.usage();

    const usersDb = await prisma.user.count();
    const economyDb = await prisma.economy.count();
    const premDb = await prisma.premium.count();

    const client = message.client as NypsiClient;

    const clusterCount = client.cluster.count;
    const currentCluster = client.cluster.id;
    const currentShard = message.guild.shardId;

    const userCount: number = await client.cluster
        .broadcastEval("this.users.cache.size")
        .then((res) => res.reduce((a, b) => a + b));
    const guildCount: number = await client.cluster
        .broadcastEval("this.guilds.cache.size")
        .then((res) => res.reduce((a, b) => a + b));

    let collections = 0;
    let mentions = 0;

    for (const mention of mentionQueue) {
        if (mention.type == "collection") {
            collections++;
        } else if (mention.type == "mention") {
            mentions++;
        }
    }

    const embed = new CustomEmbed(message.member)
        .setHeader(`nypsi stats | cluster: ${currentCluster + 1}/${clusterCount}`, client.user.avatarURL())
        .addField(
            "bot",
            "**server count** " +
                guildCount.toLocaleString() +
                "\n" +
                "**users cached** " +
                userCount.toLocaleString() +
                "\n" +
                "**total commands** " +
                commandsSize +
                "\n" +
                "**total aliases** " +
                aliasesSize,
            true
        )
        .addField(
            "database",
            `**users** ${usersDb.toLocaleString()}\n**economy** ${economyDb.toLocaleString()}\n**premium** ${premDb.toLocaleString()}`,
            true
        )
        .addField(
            "mention queue",
            "**total** " +
                mentionQueue.length.toLocaleString() +
                "\n-- **collections** " +
                collections.toLocaleString() +
                "\n-- **mentions** " +
                mentions.toLocaleString() +
                "\n-- **workers** " +
                workerCount.toLocaleString(),
            true
        )
        .addField(
            "system",
            `**memory** ${memUsage.toLocaleString()}mb/${totalMem.toLocaleString()}mb\n**cpu** ${cpuUsage}%\n**uptime** ${systemUptime}`,
            true
        )
        .addField("cluster", `**uptime** ${uptime}`, true);

    embed.setFooter({ text: `v${version} | shard: ${currentShard}` });

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
