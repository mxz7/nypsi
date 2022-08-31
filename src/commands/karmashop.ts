import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageOptions,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { createUser, getInventory, getXp, setInventory, updateXp, userExists } from "../utils/economy/utils";
import {
    closeKarmaShop,
    getKarma,
    getKarmaShopItems,
    isKarmaShopOpen,
    openKarmaShop,
    removeKarma,
} from "../utils/karma/utils";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import { getTier, isPremium, setExpireDate } from "../utils/premium/utils";
import dayjs = require("dayjs");

const cmd = new Command("karmashop", "buy stuff with your karma", Categories.INFO).setAliases(["ks"]);

cmd.slashEnabled = true;
cmd.slashData
    .addSubcommand((view) => view.setName("view").setDescription("view the karma shop"))
    .addSubcommand((buy) =>
        buy
            .setName("buy")
            .setDescription("buy something from the karma shop")
            .addStringOption((option) =>
                option
                    .setName("item-karmashop")
                    .setDescription("item you want to buy from the karma shop")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    );

const amount = new Map<string, number>();

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);
    if (message.author.id == "672793821850894347") {
        if (args[0] && args[0].toLowerCase() == "open") {
            return openKarmaShop();
        } else if (args[0] && args[0].toLowerCase() == "close") {
            return closeKarmaShop();
        }
    }

    const items = getKarmaShopItems();

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

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if (!isKarmaShopOpen() && message.guild.id == "747056029795221513") {
        const embed = new CustomEmbed(message.member);

        embed.setDescription(
            "the karma shop is currently **closed**\nkeep notifications enabled to see when the karma shop is opened!"
        );

        return send({ embeds: [embed] });
    }

    if (message.guild.id != "747056029795221513") {
        return send({
            content: "discord.gg/hJTDNST",
            embeds: [
                new CustomEmbed(message.member, "the karma shop can **only be** accessed in the official nypsi server"),
            ],
        });
    }

    let limit = 7;

    if (await isPremium(message.author.id)) {
        limit = 15;
        if ((await getTier(message.author.id)) == 4) {
            limit = 25;
        }
    }

    const itemIDs = Array.from(Object.keys(items));

    if (args.length == 0 || args.length == 1) {
        inPlaceSort(itemIDs).asc((i) => items[i].cost);

        const pages: string[][] = [];

        let pageOfItems: string[] = [];
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
        embed.setFooter({
            text: `you have ${(await getKarma(message.member)).toLocaleString()} karma ${displayItemsLeft()}`,
        });

        for (const i of pages[page]) {
            const item = items[i];
            embed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n${item.description}\n**cost** ${item.cost.toLocaleString()} karma\n*${
                    item.items_left
                }* available`,
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
                        await msg.edit({ components: [] });
                    });

                const newEmbed = new CustomEmbed(message.member).setHeader("karma shop", message.author.avatarURL());

                if (!reaction) return;

                if (reaction == "⬅") {
                    if (currentPage <= 0) {
                        return pageManager();
                    } else {
                        currentPage--;
                        for (const i of pages[currentPage]) {
                            const item = items[i];
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            );
                        }
                        newEmbed.setFooter({
                            text: `page ${currentPage + 1}/${pages.length} | you have ${(
                                await getKarma(message.member)
                            ).toLocaleString()} karma ${displayItemsLeft()}`,
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
                        await msg.edit({ embeds: [newEmbed], components: [row] });
                        return pageManager();
                    }
                } else if (reaction == "➡") {
                    if (currentPage + 1 >= lastPage) {
                        return pageManager();
                    } else {
                        currentPage++;
                        for (const i of pages[currentPage]) {
                            const item = items[i];
                            embed.addField(
                                item.id,
                                `${item.emoji} **${item.name}**\n${
                                    item.description
                                }\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
                                true
                            );
                        }
                        newEmbed.setFooter({
                            text: `page ${currentPage + 1}/${pages.length} | you have ${(
                                await getKarma(message.member)
                            ).toLocaleString()} karma ${displayItemsLeft()}`,
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
            return send({
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
            return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
        }

        if (selected.items_left <= 0) {
            return send({ embeds: [new ErrorEmbed("there is none of this item left in the shop")] });
        }

        if ((await getKarma(message.member)) < selected.cost) {
            return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
        }

        await addCooldown(cmd.name, message.member, 10);

        switch (selected.id) {
            case "bronze":
                if ((await isPremium(message.member)) && (await getTier(message.member)) >= 1) {
                    return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return send({
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
                    return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return send({
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
                    return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
                } else {
                    if (message.guild.id != "747056029795221513") {
                        return send({
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
                await setExpireDate(message.member, dayjs().add(15, "days").toDate(), message.client as NypsiClient);
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

        return send({
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
