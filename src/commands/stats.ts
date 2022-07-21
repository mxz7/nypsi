import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    Interaction,
} from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getStats } from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import prisma from "../utils/database/database";

const cmd = new Command("stats", "view your economy stats", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const normalStats = async () => {
        const stats = await getStats(message.member);

        let gambleWins = 0;
        let gambleLoses = 0;

        let itemsUsed = 0;

        for (const gambleStats in stats.gamble) {
            gambleWins += stats.gamble[gambleStats].wins;
            gambleLoses += stats.gamble[gambleStats].lose;
        }

        for (const item in stats.items) {
            itemsUsed += stats.items[item];
        }

        const embed = new CustomEmbed(message.member).setHeader("stats", message.author.avatarURL());

        embed.addField(
            "gamble",
            `**${gambleWins.toLocaleString()}** win${gambleWins == 1 ? "" : "s"}\n**${gambleLoses.toLocaleString()}** loss${
                gambleLoses == 1 ? "" : "es"
            }`,
            true
        );
        embed.addField(
            "rob",
            `**${stats.rob.wins.toLocaleString()}** win${
                stats.rob.wins == 1 ? "" : "s"
            }\n**${stats.rob.lose.toLocaleString()}** loss${stats.rob.lose == 1 ? "" : "es"}`,
            true
        );
        embed.addField("items", `**${itemsUsed.toLocaleString()}** item use${itemsUsed == 1 ? "d" : "s"}`, true);

        return message.channel.send({ embeds: [embed] });
    };

    const itemStats = async () => {
        const stats = (await getStats(message.member)).items;

        const embed = new CustomEmbed(message.member).setHeader("item stats", message.author.avatarURL());

        const pages = new Map();

        if (Array.from(Object.keys(stats)).length > 6) {
            for (const item in stats) {
                if (pages.size == 0) {
                    pages.set(1, [item]);
                } else {
                    if (pages.get(pages.size).length >= 6) {
                        pages.set(pages.size + 1, [item]);
                    } else {
                        const current = pages.get(pages.size);
                        current.push(item);
                        pages.set(pages.size, current);
                    }
                }
            }
            embed.setFooter({ text: `page 1/${pages.size}` });
        }

        for (const item in stats) {
            if (embed.data.fields.length >= 6) break;

            embed.addField(item, `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`, true);
        }

        let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
        );

        let msg: Message;

        if (pages.size == 1) {
            return await message.channel.send({ embeds: [embed] });
        } else {
            msg = await message.channel.send({ embeds: [embed], components: [row] });
        }

        if (pages.size == 0) return;

        let currentPage = 1;
        const lastPage = pages.size;

        const filter = (i: Interaction) => i.user.id == message.author.id;

        const pageManager = async (): Promise<void> => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await msg.edit({ components: [] });
                });

            if (!reaction) return;

            const newEmbed = new CustomEmbed(message.member).setHeader("item stats", message.author.avatarURL());

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager();
                } else {
                    currentPage--;

                    for (const item of pages.get(currentPage)) {
                        newEmbed.addField(
                            item,
                            `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`,
                            true
                        );
                    }

                    newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
                    if (currentPage == 1) {
                        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId("⬅")
                                .setLabel("back")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    } else {
                        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId("⬅")
                                .setLabel("back")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    }
                    await msg.edit({ embeds: [newEmbed], components: [row] });
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;

                    for (const item of pages.get(currentPage)) {
                        newEmbed.addField(
                            item,
                            `**${stats[item].toLocaleString()}** use${stats[item] > 1 ? "s" : ""}`,
                            true
                        );
                    }

                    newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
                    if (currentPage == lastPage) {
                        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId("⬅")
                                .setLabel("back")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                        );
                    } else {
                        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId("⬅")
                                .setLabel("back")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false),
                            new ButtonBuilder()
                                .setCustomId("➡")
                                .setLabel("next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(false)
                        );
                    }
                    await msg.edit({ embeds: [newEmbed], components: [row] });
                    return pageManager();
                }
            }
        };

        return pageManager();
    };

    const gambleStats = async () => {
        const stats = (await getStats(message.member)).gamble;

        const embed = new CustomEmbed(message.member).setHeader("gamble stats", message.author.avatarURL());

        for (const gambleStat in stats) {
            embed.addField(
                gambleStat,
                `**${stats[gambleStat].wins.toLocaleString()}** win${stats[gambleStat].wins == 1 ? "" : "s"}\n**${stats[
                    gambleStat
                ].lose.toLocaleString()}** loss${stats[gambleStat].lose == 1 ? "" : "es"}`,
                true
            );
        }

        return message.channel.send({ embeds: [embed] });
    };

    if (args.length == 0) {
        return normalStats();
    } else if (args[0].toLowerCase() == "gamble") {
        return gambleStats();
    } else if (args[0].toLowerCase() == "item" || args[0].toLowerCase() == "items") {
        return itemStats();
    } else if (args[0].toLowerCase() == "global" && message.author.id == "672793821850894347") {
        const gambleTotal = await prisma.economyStats.aggregate({
            where: {
                gamble: true,
            },
            _sum: {
                win: true,
                lose: true,
            },
        });

        const byTypeGamble = await prisma.economyStats.groupBy({
            where: {
                gamble: true,
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
                gamble: false,
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

            itemMsg.push(` - **${item.type}** ${item._sum.win} (${percent}%)`);
        }

        embed.addField("item stats", itemMsg.join("\n"), true);

        const robTotal = robStats._sum.win + robStats._sum.lose;
        const robPercent = ((robStats._sum.win / robTotal) * 100).toFixed(2);

        embed.setFooter({ text: `rob: ${robStats._sum.win} / ${robTotal} (${robPercent}%)` });

        embed.setHeader("global stats");
        return message.channel.send({ embeds: [embed] });
    } else {
        return normalStats();
    }
}

cmd.setRun(run);

module.exports = cmd;
