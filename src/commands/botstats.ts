import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { cpu } from "node-os-utils";
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../package.json";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import { workerCount } from "../events/message.js";
import { deleteQueue, mentionQueue } from "../utils/users/utils.js";
import * as os from "os";
import { MStoTime } from "../utils/functions/date.js";
import { aliasesSize, commandsSize } from "../utils/commandhandler";

const cmd = new Command("botstats", "view stats for the bot", Categories.INFO);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (message.author.id != "672793821850894347") return;
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 5);

    const systemUptime = MStoTime(os.uptime() * 1000);
    const uptime = MStoTime(message.client.uptime);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const memUsage = Math.round(totalMem - freeMem);
    const cpuUsage = await cpu.usage();

    let memberCount = 0;

    const guilds = message.client.guilds.cache;
    guilds.forEach((g) => {
        memberCount = memberCount + g.memberCount;
    });

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
        .setHeader("nypsi stats")
        .addField(
            "bot",
            "**server count** " +
                guilds.size.toLocaleString() +
                "\n" +
                "**user count** " +
                memberCount.toLocaleString() +
                "\n" +
                "**total commands** " +
                commandsSize +
                "\n" +
                "**total aliases** " +
                aliasesSize +
                "\n" +
                "**uptime** " +
                uptime,
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
                "\n-- **deletable** " +
                deleteQueue.length.toLocaleString() +
                "\n-- **workers** " +
                workerCount.toLocaleString(),
            true
        )
        .addField(
            "system",
            `**memory** ${memUsage.toLocaleString()}mb/${totalMem.toLocaleString()}mb\n**cpu** ${cpuUsage}%\n**uptime** ${systemUptime}`,
            true
        );

    embed.setFooter({ text: `v${version}` });

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
