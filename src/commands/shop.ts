import { CommandInteraction, Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getItems } from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("shop", "view current items that are available to buy/sell", Categories.MONEY).setAliases(["store"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 10);

    let page = 0;

    if (args.length == 1) {
        if (!parseInt(args[0])) {
            page = 1;
        } else {
            page = parseInt(args[0]) - 1;
            if (page < 0) {
                page = 0;
            }
        }
    }

    const items = getItems();

    const itemIDs = Array.from(Object.keys(items));

    inPlaceSort(itemIDs).asc();

    const pages = [];

    let pageOfItems = [];
    for (const item of itemIDs) {
        if (!items[item].worth) continue;
        if (
            items[item].role == "prey" ||
            items[item].role == "fish" ||
            items[item].role == "collectable" ||
            items[item].role == "car" ||
            items[item].role == "sellable" ||
            items[item].role == "ore"
        )
            continue;
        if (pageOfItems.length == 6) {
            pages.push(pageOfItems);
            pageOfItems = [item];
        } else {
            pageOfItems.push(item);
        }
    }

    if (pageOfItems.length != 0) {
        pages.push(pageOfItems);
    }

    const embed = new CustomEmbed(message.member).setFooter(`page ${page + 1}/${pages.length}`);

    embed.setHeader("shop", message.author.avatarURL());

    if (!pages[page]) {
        page = 0;
    }

    for (let item of pages[page]) {
        item = items[item];
        embed.addField(
            item.id,
            `${item.emoji} **${item.name}**\n${item.description}\n**worth** $${item.worth.toLocaleString()}`,
            true
        );
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    /**
     * @type {Message}
     */
    let msg;

    if (pages.length == 1) {
        return await message.channel.send({ embeds: [embed] });
    } else {
        msg = await message.channel.send({ embeds: [embed], components: [row] });
    }

    if (pages.length > 1) {
        let currentPage = page;

        const lastPage = pages.length;

        const filter = (i) => i.user.id == message.author.id;

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await msg.edit({ components: [] });
                });

            const newEmbed = new CustomEmbed(message.member).setHeader("shop", message.author.avatarURL());

            if (!reaction) return;

            if (reaction == "⬅") {
                if (currentPage <= 0) {
                    return pageManager();
                } else {
                    currentPage--;
                    for (let item of pages[currentPage]) {
                        item = items[item];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${item.description}\n**worth** $${item.worth.toLocaleString()}`,
                            true
                        );
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length}`);
                    if (currentPage == 0) {
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
                if (currentPage + 1 >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;
                    for (let item of pages[currentPage]) {
                        item = items[item];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}**\n${item.description}\n**worth** $${item.worth.toLocaleString()}`,
                            true
                        );
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length}`);
                    if (currentPage + 1 == lastPage) {
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
    }
}

cmd.setRun(run);

module.exports = cmd;
