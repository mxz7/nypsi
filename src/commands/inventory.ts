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
import { createUser, getInventory, getItems, userExists } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("inventory", "view items in your inventory", Categories.MONEY).setAliases(["inv"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("page").setDescription("page number"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

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

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed], ephemeral: true });
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

    const inventory = await getInventory(message.member);
    const items = getItems();

    const itemIDs = Array.from(Object.keys(inventory));

    if (itemIDs.length == 0) {
        return send({
            embeds: [
                new CustomEmbed(message.member, "your inventory is empty").setHeader(
                    "your inventory",
                    message.author.avatarURL()
                ),
            ],
        });
    }

    inPlaceSort(itemIDs).asc();

    const pages: string[][] = [];
    let pageOfItems: string[] = [];
    let worth = 0;

    for (const item of itemIDs) {
        if (pageOfItems.length == 6) {
            pages.push(pageOfItems);
            pageOfItems = [item];
        } else {
            pageOfItems.push(item);
        }

        if (items[item].sell) {
            const amount = inventory[item];

            worth += Math.floor(items[item].sell * amount);
        }
    }

    if (pageOfItems.length != 0) {
        pages.push(pageOfItems);
    }

    const embed = new CustomEmbed(message.member).setFooter({
        text: `page ${page + 1}/${pages.length} | worth: $${worth.toLocaleString()}`,
    });

    embed.setHeader("your inventory", message.author.avatarURL());

    if (!pages[page]) {
        page = 0;
    }

    for (const i of pages[page]) {
        const item = items[i];
        embed.addField(
            item.id,
            `${item.emoji} **${item.name}** ~~--~~ *${inventory[item.id].toLocaleString()}*${
                item.shortDesc ? `\n${item.shortDesc}` : "\n\u200b"
            }`,
            true
        );
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    let msg: Message;

    if (pages.length == 1) {
        return await send({ embeds: [embed] });
    } else {
        msg = await send({ embeds: [embed], components: [row] });
    }

    const edit = async (data: MessageEditOptions, msg: Message) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    if (pages.length > 1) {
        let currentPage = page;

        const lastPage = pages.length;

        const filter = (i: Interaction) => i.user.id == message.author.id;

        const pageManager = async (): Promise<void> => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (collected) => {
                    await collected.deferUpdate();
                    return collected.customId;
                })
                .catch(async () => {
                    await edit({ components: [] }, msg);
                });

            const newEmbed = new CustomEmbed(message.member).setHeader("your inventory", message.author.avatarURL());

            if (!reaction) return;

            if (reaction == "⬅") {
                if (currentPage <= 0) {
                    return pageManager();
                } else {
                    currentPage--;
                    for (const i of pages[currentPage]) {
                        const item = items[i];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}** ~~--~~ *${inventory[item.id].toLocaleString()}*${
                                item.shortDesc ? `\n${item.shortDesc}` : "\n\u200b"
                            }`,
                            true
                        );
                    }
                    newEmbed.setFooter({
                        text: `page ${currentPage + 1}/${pages.length} | worth: $${worth.toLocaleString()}`,
                    });
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
                    await edit({ embeds: [newEmbed], components: [row] }, msg);
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage + 1 >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;
                    for (const i of pages[currentPage]) {
                        const item = items[i];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}** ~~--~~ *${inventory[item.id].toLocaleString()}*${
                                item.shortDesc ? `\n${item.shortDesc}` : "\n\u200b"
                            }`,
                            true
                        );
                    }
                    newEmbed.setFooter({
                        text: `page ${currentPage + 1}/${pages.length} | worth: $${worth.toLocaleString()}`,
                    });
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
                    await edit({ embeds: [newEmbed], components: [row] }, msg);
                    return pageManager();
                }
            }
        };
        return pageManager();
    }
}

cmd.setRun(run);

module.exports = cmd;
