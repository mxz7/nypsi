import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageOptions,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getAllAchievements, getUncompletedAchievements, getUserAchievement } from "../utils/economy/achievements";
import { getAchievements } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { AchievementData } from "../utils/models/Economy";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("achievements", "view your achievement progress", Categories.MONEY).setAliases([
    "ach",
    "achievement",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data: MessageOptions | InteractionReplyOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data as MessageOptions);
        }
    };

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed], ephemeral: true });
    }

    await addCooldown(cmd.name, message.member, 15);

    const showCurrentProgress = async () => {
        const allAchievementData = getAchievements();
        const achievements = await getUncompletedAchievements(message.author.id);

        if (!achievements || achievements.length == 0) {
            return showAllAchievements();
        }

        const desc: string[] = [];

        for (const achievement of achievements) {
            if (achievement.completed) continue;
            desc.push(
                `${allAchievementData[achievement.achievementId].emoji} ${
                    allAchievementData[achievement.achievementId].name
                } \`${achievement.progress.toLocaleString()} / ${allAchievementData[
                    achievement.achievementId
                ].target.toLocaleString()} (${(
                    (achievement.progress / allAchievementData[achievement.achievementId].target) *
                    100
                ).toFixed(1)}%)\``
            );
        }

        if (desc.length == 0) return showAllAchievements();

        const embed = new CustomEmbed(message.member, desc.join("\n")).setHeader(
            "your achievement progress",
            message.author.avatarURL()
        );

        return send({ embeds: [embed] });
    };

    const showAllAchievements = async () => {
        const allAchievements = getAchievements();
        const achievementIds = Object.keys(allAchievements);
        const usersAchievements = await getAllAchievements(message.author.id);
        const userAchievementIds = usersAchievements.map((i) => i.achievementId);

        inPlaceSort(achievementIds).asc();

        const pages = new Map<number, string[]>();

        for (const achievementId of achievementIds) {
            const achievement = allAchievements[achievementId];

            let str = `${achievement.emoji} ${achievement.name} `;

            if (userAchievementIds.includes(achievementId)) {
                const achData = usersAchievements.find((i) => i.achievementId == achievementId);

                if (!achData) continue;

                if (achData.completed) {
                    str += "`completed`";
                } else {
                    str += `\`${achData.progress.toLocaleString()} / ${achievement.target} (${(
                        (achData.progress / achievement.target) *
                        100
                    ).toFixed(1)}%)\``;
                }
            } else {
                str += `*${achievement.description}*`;
            }

            if (pages.size == 0) {
                pages.set(1, [str]);
            } else if (pages.get(pages.size).length >= 10) {
                pages.set(pages.size + 1, [str]);
            } else {
                const arr = pages.get(pages.size);
                arr.push(str);
            }
        }

        const completion = `${((usersAchievements.length / Object.keys(allAchievements).length) * 100).toFixed(
            1
        )}% completion`;

        const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
            .setHeader("all achievements", message.author.avatarURL())
            .setFooter({ text: `page 1/${pages.size} | ${completion}` });

        let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
        );

        let msg: Message;

        if (pages.size == 1) {
            return await send({ embeds: [embed] });
        } else {
            msg = await send({ embeds: [embed], components: [row] });
        }

        const filter = (i: Interaction) => i.user.id == message.author.id;

        let currentPage = 1;

        const pageManager = async (): Promise<void> => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await edit({ components: [] }, msg).catch(() => {});
                });

            if (!reaction) return;

            const newEmbed = new CustomEmbed(message.member).setHeader("most used commands", message.author.avatarURL());

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager();
                } else {
                    currentPage--;

                    newEmbed.setDescription(pages.get(currentPage).join("\n"));

                    newEmbed.setFooter({ text: `page ${currentPage}/${pages.size} | ${completion}` });

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
                    await edit({ embeds: [newEmbed], components: [row] }, msg);
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage >= pages.size) {
                    return pageManager();
                } else {
                    currentPage++;

                    newEmbed.setDescription(pages.get(currentPage).join("\n"));

                    newEmbed.setFooter({ text: `page ${currentPage}/${pages.size} | ${completion}` });

                    if (currentPage == pages.size) {
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
                    await edit({ embeds: [newEmbed], components: [row] }, msg);
                    return pageManager();
                }
            }
        };

        return pageManager();
    };

    const showSpecificAchievement = async () => {
        args.shift();

        let selected: AchievementData;

        const allAchievementData = getAchievements();

        const searchTag = args.join(" ");

        for (const achievementId of Object.keys(allAchievementData)) {
            const achievement = allAchievementData[achievementId];

            if (searchTag.toLowerCase() == achievement.id) {
                selected = achievement;
                break;
            } else if (achievement.name.replaceAll("*", "").toLowerCase().includes(searchTag)) {
                selected = achievement;
                break;
            }
        }

        const achievement = await getUserAchievement(message.author.id, selected.id);

        const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

        let desc = `\`${selected.id}\`\n\n*${selected.description}*`;

        if (achievement) {
            if (achievement.completed) {
                desc += `\n\ncompleted <t:${Math.floor(achievement.completedAt.getTime() / 1000)}:R>`;
            } else {
                desc += `\n\n${achievement.progress.toLocaleString()} / ${selected.target.toLocaleString()} (${(
                    (achievement.progress / selected.target) *
                    100
                ).toFixed(1)}%)`;
            }
        }

        embed.setDescription(desc);

        return send({ embeds: [embed] });
    };

    if (args.length == 0) {
        return showCurrentProgress();
    } else if (args[0].toLowerCase() == "view") {
        return showCurrentProgress();
    } else if (args[0].toLocaleLowerCase() == "all") {
        return showAllAchievements();
    } else if (args[0].toLowerCase() == "show" || args[0].toLowerCase() == "view") {
        return showSpecificAchievement();
    }
}

cmd.setRun(run);

module.exports = cmd;
