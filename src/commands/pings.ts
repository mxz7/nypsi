import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    MessageOptions,
    InteractionReplyOptions,
    MessageEditOptions,
    Interaction,
} from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { isPremium } from "../utils/premium/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { deleteUserMentions, fetchUserMentions } from "../utils/users/utils";
import { userExists } from "../utils/economy/utils";
import { getKarma, getLastCommand } from "../utils/karma/utils";
import ms = require("ms");
import { decrypt } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("pings", "view who mentioned you recently", Categories.UTILITY).setAliases([
    "mentions",
    "whothefuckpingedme",
]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const send = async (data: MessageOptions) => {
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
            return await message.channel.send(data);
        }
    };

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 20);

    let qualified = false;

    if (
        message.guild.memberCount < 150000 &&
        ((await userExists(message.guild.ownerId)) ||
            (await isPremium(message.guild.ownerId)) ||
            (await getKarma(message.guild.ownerId)) >= 50 ||
            (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("1 days"))
    ) {
        qualified = true;
    }

    const prefix = await getPrefix(message.guild);

    if (!qualified) {
        const embed = new ErrorEmbed(
            `this server does not qualify to track mentions (${prefix}pings)\n\njoin the support server for help (${prefix}support)`
        );

        return send({ embeds: [embed] });
    }

    const mentions = fetchUserMentions(message.guild, message.member);

    if (!mentions || mentions.length == 0) {
        return send({ embeds: [new CustomEmbed(message.member, "no recent mentions")] });
    }

    const pages = new Map();

    for (const i of mentions) {
        if (pages.size == 0) {
            const page1 = [];
            page1.push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${decrypt(i.content)}\n[jump](${i.url})`);
            pages.set(1, page1);
        } else {
            const lastPage = pages.size;

            if (pages.get(lastPage).length >= 3) {
                const newPage = [];
                newPage.push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${decrypt(i.content)}\n[jump](${i.url})`);
                pages.set(lastPage + 1, newPage);
            } else {
                pages.get(lastPage).push(`<t:${i.date}:R>|6|9|**${i.user_tag}**: ${decrypt(i.content)}\n[jump](${i.url})`);
            }
        }
    }

    const embed = new CustomEmbed(message.member).setHeader("recent mentions", message.author.avatarURL());

    for (const i of pages.get(1)) {
        const fieldName = i.split("|6|9|")[0];
        const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
        embed.addField(fieldName, fieldValue);
    }

    if (pages.size >= 2) {
        embed.setFooter({ text: `page 1/${pages.size}` });
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
    );

    let msg: Message;

    if (pages.size == 1) {
        return await send({ embeds: [embed] });
    } else {
        msg = await send({ embeds: [embed], components: [row] });
    }

    if (pages.size >= 2) {
        let currentPage = 1;
        const lastPage = pages.size;

        const edit = async (data: MessageEditOptions) => {
            if (!(message instanceof Message)) {
                await message.editReply(data);
                return await message.fetchReply();
            } else {
                return await msg.edit(data);
            }
        };

        const filter = (i: Interaction) => i.user.id == message.author.id;

        const pageManager = async (): Promise<void> => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await edit({ components: [] }).catch(() => {});
                });

            if (!reaction) return;

            const newEmbed = new CustomEmbed(message.member).setHeader("recent mentions", message.author.avatarURL());

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager();
                } else {
                    currentPage--;

                    for (const i of pages.get(currentPage)) {
                        const fieldName = i.split("|6|9|")[0];
                        const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
                        newEmbed.addField(fieldName, fieldValue);
                    }

                    newEmbed.setFooter({ text: "page " + currentPage + "/" + lastPage });
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
                                .setDisabled(false),
                            new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
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
                                .setDisabled(false),
                            new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
                        );
                    }
                    await edit({ embeds: [newEmbed], components: [row] });
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;

                    for (const i of pages.get(currentPage)) {
                        const fieldName = i.split("|6|9|")[0];
                        const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
                        newEmbed.addField(fieldName, fieldValue);
                    }
                    newEmbed.setFooter({ text: "page " + currentPage + "/" + lastPage });
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
                                .setDisabled(true),
                            new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
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
                                .setDisabled(false),
                            new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
                        );
                    }
                    await edit({ embeds: [newEmbed], components: [row] });
                    return pageManager();
                }
            } else if (reaction == "❌") {
                deleteUserMentions(message.guild, message.member);

                newEmbed.setDescription("✅ mentions cleared");

                edit({ embeds: [newEmbed], components: [] });
                return;
            }
        };

        return pageManager();
    }
}

cmd.setRun(run);

module.exports = cmd;
