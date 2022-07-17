import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { isKarmaShopOpen, getKarma, openKarmaShop, closeKarmaShop, removeKarma } from "../utils/karma/utils";
import { inPlaceSort } from "fast-sort";
import { isPremium, getTier, setExpireDate } from "../utils/premium/utils";
import { updateXp, getXp, userExists, createUser, getInventory, setInventory } from "../utils/economy/utils";
import { CommandInteraction, Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("karmashop", "buy stuff with your karma", Categories.INFO).setAliases(["ks"]);

declare function require(name: string);

const items = require("../../data/karmashop.json");

/**
 * @type {Map<string, number>}
 */
const amount = new Map();

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) await createUser(message.member);
    if (message.author.id == "672793821850894347") {
        if (args[0] && args[0].toLowerCase() == "open") {
            return openKarmaShop();
        } else if (args[0] && args[0].toLowerCase() == "close") {
            return closeKarmaShop();
        }
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!isKarmaShopOpen()) {
        const embed = new CustomEmbed(message.member);
        embed.setDescription(
            "the karma shop is currently closed\nyou can join the [official nypsi server](https://discord.gg/hJTDNST) to be notified when it is opened"
        );
        return message.channel.send({ embeds: [embed] });
    }

    let limit = 15;

    if (await isPremium(message.author.id)) {
        limit = 20;
        if ((await getTier(message.author.id)) == 4) {
            limit = 50;
        }
    }

    const itemIDs = Array.from(Object.keys(items));

    if (args.length == 0 || args.length == 1) {
        inPlaceSort(itemIDs).asc((i) => items[i].cost);

        const pages = [];

        let pageOfItems = [];
        for (const item of itemIDs) {
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

        const page = 0;

        const embed = new CustomEmbed(message.member);

        /**
         *
         * @returns {string}
         */
        const displayItemsLeft = () => {
            let text;
            if (amount.has(message.author.id)) {
                text = `| ${amount.get(message.author.id)}/${limit}`;
            } else {
                text = `| 0/${limit}`;
            }

            return text;
        };

        embed.setHeader("karma shop", message.author.avatarURL());
        embed.setFooter(`you have ${(await getKarma(message.member)).toLocaleString()} karma ${displayItemsLeft()}`);

        for (let item of pages[page]) {
            item = items[item];
            embed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n${item.description}\n**cost** ${item.cost.toLocaleString()} karma\n*${
                    item.items_left
                }* available`,
                true
            );
        }

        let row = new ActionRowBuilder().addComponents(
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

                const newEmbed = new CustomEmbed(message.member).setHeader("karma shop", message.author.avatarURL());

                if (!reaction) return;

                if (reaction == "⬅") {
                    if (currentPage <= 0) {
                        return pageManager();
                    } else {
                        currentPage--;
                        for (let item of pages[currentPage]) {
                            item = items[item];
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            );
                        }
                        newEmbed.setFooter(
                            `page ${currentPage + 1}/${pages.length} | you have ${(
                                await getKarma(message.member)
                            ).toLocaleString()} karma ${displayItemsLeft()}`
                        );
                        if (currentPage == 0) {
                            row = new ActionRowBuilder().addComponents(
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
                            row = new ActionRowBuilder().addComponents(
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
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            );
                        }
                        newEmbed.setFooter(
                            `page ${currentPage + 1}/${pages.length} | you have ${(
                                await getKarma(message.member)
                            ).toLocaleString()} karma ${displayItemsLeft()}`
                        );
                        if (currentPage + 1 == lastPage) {
                            row = new ActionRowBuilder().addComponents(
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
                            row = new ActionRowBuilder().addComponents(
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
    } else if (args[0].toLowerCase() == "buy") {
        const amountBought = amount.get(message.author.id);

        if (amountBought >= limit) {
            return message.channel.send({
                embeds: [
                    new CustomEmbed(
                        message.member,
                        `you have reached your limit for buying from the karma shop (${limit} items)`
                    ),
                ],
            });
        }

        const searchTag = args[1].toLowerCase();

        let selected;

        for (const itemName of Array.from(Object.keys(items))) {
            if (searchTag == itemName) {
                selected = itemName;
                break;
            } else if (searchTag == itemName.split("_").join("")) {
                selected = itemName;
                break;
            }
        }

        selected = items[selected];

        if (!selected) {
            return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
        }

        if (selected.items_left <= 0) {
            return message.channel.send({ embeds: [new ErrorEmbed("there is none of this item left in the shop")] });
        }

        if ((await getKarma(message.member)) < selected.cost) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this")] });
        }

        await addCooldown(cmd.name, message.member, 10);

        switch (selected.id) {
            case "bronze":
                if ((await isPremium(message.member)) && (await getTier(message.member)) >= 1) {
                    return message.channel.send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return message.channel.send({
                            embeds: [
                                new ErrorEmbed(
                                    "you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)"
                                ),
                            ],
                        });
                    } else {
                        await message.member.roles.add("819870590718181391");
                    }
                }
                break;
            case "silver":
                if ((await isPremium(message.member)) && (await getTier(message.member)) >= 2) {
                    return message.channel.send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return message.channel.send({
                            embeds: [
                                new ErrorEmbed(
                                    "you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)"
                                ),
                            ],
                        });
                    } else {
                        await message.member.roles.add("819870727834566696");
                    }
                }
                break;
            case "gold":
                if ((await isPremium(message.member)) && (await getTier(message.member)) >= 3) {
                    return message.channel.send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return message.channel.send({
                            embeds: [
                                new ErrorEmbed(
                                    "you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)"
                                ),
                            ],
                        });
                    } else {
                        await message.member.roles.add("819870846536646666");
                    }
                }
                break;
            case "100xp":
                await updateXp(message.member, (await getXp(message.member)) + 100);
                break;
            case "1000xp":
                await updateXp(message.member, (await getXp(message.member)) + 1000);
                break;
            case "basic_crate":
                const inventory = await getInventory(message.member); // eslint-disable-line

                if (inventory["basic_crate"]) {
                    inventory["basic_crate"]++;
                } else {
                    inventory["basic_crate"] = 1;
                }

                await setInventory(message.member, inventory);
        }

        if (selected.id == "bronze" || selected.id == "silver" || selected.id == "gold") {
            setTimeout(async () => {
                await setExpireDate(message.member, dayjs().add(15, "days").toDate());
            }, 1000);
        }

        if (amount.has(message.author.id)) {
            amount.set(message.author.id, amount.get(message.author.id) + 1);
        } else {
            amount.set(message.author.id, 1);
        }

        await removeKarma(message.member, selected.cost);

        if (!selected.unlimited) {
            items[selected.id].items_left -= 1;
        }

        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    `you have bought ${selected.emoji} ${selected.name} for ${selected.cost.toLocaleString()} karma`
                ),
            ],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
