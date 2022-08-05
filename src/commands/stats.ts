import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import prisma from "../utils/database/database";
import redis from "../utils/database/redis";
import { getStats } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("stats", "view your economy stats", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const normalStats = async () => {
        const stats = await getStats(message.member);
        const commandUses = parseInt(await redis.hget("nypsi:topcommands:user", message.author.tag));

        const embed = new CustomEmbed(message.member).setHeader("stats", message.author.avatarURL());

        let gambleTotal = 0;
        let gambleWinTotal = 0;

        for (const g of Object.keys(stats.gamble)) {
            gambleTotal += stats.gamble[g].wins + stats.gamble[g].lose;
            gambleWinTotal += stats.gamble[g].wins;
        }

        const gambleTotalPercent = ((gambleWinTotal / gambleTotal) * 100).toFixed(1);

        const gambleMsg: string[] = [
            `**total** ${gambleWinTotal.toLocaleString()} / ${gambleTotal.toLocaleString()} (${gambleTotalPercent}%)`,
        ];

        for (const g of Object.keys(stats.gamble)) {
            const percent = ((stats.gamble[g].wins / (stats.gamble[g].lose + stats.gamble[g].wins)) * 100).toFixed(1);
            gambleMsg.push(
                `- **${g}** ${stats.gamble[g].wins.toLocaleString()} / ${(
                    stats.gamble[g].wins + stats.gamble[g].lose
                ).toLocaleString()} (${percent}%)`
            );
        }

        embed.addField("gamble", gambleMsg.join("\n"), true);

        let itemTotal = 0;

        for (const i of Object.keys(stats.items)) {
            itemTotal += stats.items[i];
        }

        const itemMsg: string[] = [`**total** ${itemTotal.toLocaleString()}`];

        for (const i of Object.keys(stats.items)) {
            if (itemMsg.length >= 8) break;
            itemMsg.push(`- **${i}** ${stats.items[i].toLocaleString()}`);
        }

        embed.addField("item uses", itemMsg.join("\n"), true);
        
        let cmdMsg = commandUses.toLocaleString()
        
        if (cmdMsg == "NaN") cmdMsg = 'no'

        embed.setFooter({ text: `you have performed ${cmdMsg} commands today` });

        return message.channel.send({ embeds: [embed] });
    };

    if (args.length == 0) {
        return normalStats();
    } else if (args[0].toLowerCase() == "global" && message.author.id == "672793821850894347") {
        const gambleTotal = await prisma.economyStats.aggregate({
            where: {
                AND: [
                    {
                        gamble: true,
                    },
                    {
                        NOT: { type: "rob" },
                    },
                ],
            },
            _sum: {
                win: true,
                lose: true,
            },
        });

        const byTypeGamble = await prisma.economyStats.groupBy({
            where: {
                AND: [
                    {
                        gamble: true,
                    },
                    {
                        NOT: { type: "rob" },
                    },
                ],
            },
            by: ["type"],
            _sum: {
                win: true,
                lose: true,
            },
            orderBy: {
                _sum: {
                    win: "desc",
                },
            },
        });

        const itemTotal = await prisma.economyStats.aggregate({
            where: {
                AND: [
                    {
                        gamble: false,
                    },
                    {
                        NOT: { type: "rob" },
                    },
                ],
            },
            _sum: {
                win: true,
            },
        });

        const byItem = await prisma.economyStats.groupBy({
            where: {
                AND: [
                    {
                        gamble: false,
                    },
                    {
                        NOT: { type: "rob" },
                    },
                ],
            },
            by: ["type"],
            _sum: {
                win: true,
            },
            orderBy: {
                _sum: {
                    win: "desc",
                },
            },
        });

        const robStats = await prisma.economyStats.aggregate({
            where: {
                type: "rob",
            },
            _sum: {
                win: true,
                lose: true,
            },
        });

        const embed = new CustomEmbed(message.member);

        const gambleOverall = gambleTotal._sum.win + gambleTotal._sum.lose;
        const gambleWinPercent = ((gambleTotal._sum.win / gambleOverall) * 100).toFixed(2);

        const gambleMsg = [
            `**total** ${gambleTotal._sum.win.toLocaleString()} / ${gambleOverall.toLocaleString()} (${gambleWinPercent}%)`,
        ];

        for (const gamble of byTypeGamble) {
            const total = gamble._sum.win + gamble._sum.lose;

            const percent = ((gamble._sum.win / total) * 100).toFixed(2);

            gambleMsg.push(
                ` - **${gamble.type}** ${gamble._sum.win.toLocaleString()} / ${total.toLocaleString()} (${percent}%)`
            );
        }

        embed.addField("gamble wins", gambleMsg.join("\n"), true);

        const itemMsg = [`**total** ${itemTotal._sum.win.toLocaleString()}`];

        for (const item of byItem) {
            if (itemMsg.length >= gambleMsg.length) break;

            const percent = ((item._sum.win / itemTotal._sum.win) * 100).toFixed(2);

            itemMsg.push(` - **${item.type}** ${item._sum.win.toLocaleString()} (${percent}%)`);
        }

        embed.addField("item stats", itemMsg.join("\n"), true);

        const robTotal = robStats._sum.win + robStats._sum.lose;
        const robPercent = ((robStats._sum.win / robTotal) * 100).toFixed(2);

        embed.setFooter({
            text: `rob: ${robStats._sum.win.toLocaleString()} / ${robTotal.toLocaleString()} (${robPercent}%)`,
        });

        embed.setHeader("global stats", message.author.avatarURL());
        return message.channel.send({ embeds: [embed] });
    } else {
        return normalStats();
    }
}

cmd.setRun(run);

module.exports = cmd;
