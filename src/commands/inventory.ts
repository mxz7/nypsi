import { CommandInteraction, Message, MessageActionRow, MessageButton } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getInventory, getItems, createUser, userExists, getMulti } from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("inventory", "view items in your inventory", Categories.MONEY).setAliases(["inv"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("page").setDescription("page number"));

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data);
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
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
                new CustomEmbed(message.member, false, "your inventory is empty").setHeader(
                    "your inventory",
                    message.author.avatarURL()
                ),
            ],
        });
    }

    inPlaceSort(itemIDs).asc();

    const pages = [];
    let pageOfItems = [];
    let worth = 0;
    const multi = await getMulti(message.member);

    for (const item of itemIDs) {
        if (pageOfItems.length == 6) {
            pages.push(pageOfItems);
            pageOfItems = [item];
        } else {
            pageOfItems.push(item);
        }
        if (items[item].worth) {
            let fee = 0.5;
            if (items[item].emoji == ":coin:") {
                fee = 0.95;
            }
            const amount = inventory[item];

            if (items[item].role == "fish" || items[item].role == "prey") {
                const worth1 = Math.floor(items[item].worth * fee * amount);
                worth += Math.floor(worth1 + worth1 * multi);
            } else {
                worth += Math.floor(items[item].worth * fee * amount);
            }
        } else {
            worth += 1000;
        }
    }

    if (pageOfItems.length != 0) {
        pages.push(pageOfItems);
    }

    const embed = new CustomEmbed(message.member).setFooter(
        `page ${page + 1}/${pages.length} | worth: $${worth.toLocaleString()}`
    );

    embed.setHeader("your inventory", message.author.avatarURL());

    if (!pages[page]) {
        page = 0;
    }

    for (let item of pages[page]) {
        item = items[item];
        embed.addField(
            item.id,
            `${item.emoji} **${item.name}** -- ${inventory[item.id].toLocaleString()}\n${item.description}`,
            true
        );
    }

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    );

    /**
     * @type {Message}
     */
    let msg;

    if (pages.length == 1) {
        return await send({ embeds: [embed] });
    } else {
        msg = await send({ embeds: [embed], components: [row] });
    }

    const edit = async (data, msg) => {
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

        const filter = (i) => i.user.id == message.author.id;

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
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
                    for (let item of pages[currentPage]) {
                        item = items[item];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}** -- ${inventory[item.id].toLocaleString()}\n${item.description}`,
                            true
                        );
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length} | worth: $${worth.toLocaleString()}`);
                    if (currentPage == 0) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                        );
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
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
                    for (let item of pages[currentPage]) {
                        item = items[item];
                        newEmbed.addField(
                            item.id,
                            `${item.emoji} **${item.name}** -- ${inventory[item.id].toLocaleString()}\n${item.description}`,
                            true
                        );
                    }
                    newEmbed.setFooter(`page ${currentPage + 1}/${pages.length} | worth: $${worth.toLocaleString()}`);
                    if (currentPage + 1 == lastPage) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                        );
                    } else {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
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
