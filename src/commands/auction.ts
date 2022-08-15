import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    Message,
    MessageActionRowComponentBuilder,
    SelectMenuBuilder,
    SelectMenuOptionBuilder,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    createAuction,
    deleteAuction,
    formatBet,
    getAuctions,
    getInventory,
    getItems,
    setInventory,
} from "../utils/economy/utils";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { Item } from "../utils/models/Economy";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getTier, isPremium } from "../utils/premium/utils";

const cmd = new Command("auction", "create and manage your item auctions", Categories.MONEY).setAliases(["ah"]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const items = getItems();

    const createAuctionProcess = async (msg: Message) => {
        const embed = new CustomEmbed(message.member).setHeader("create an auction", message.author.avatarURL());

        let inventory = await getInventory(message.member);

        if (Object.keys(inventory).length == 0) {
            embed.setDescription("you have nothing in your inventory");
            return msg.edit({ embeds: [embed], components: [] });
        }

        let selected: Item;

        if (Object.keys(inventory).length <= 25) {
            embed.setDescription("select the **item you want to sell** from the dropdown list below");

            const options: SelectMenuOptionBuilder[] = [];

            for (const item of Object.keys(inventory)) {
                if (inventory[item] != 0) {
                    options.push(
                        new SelectMenuOptionBuilder()
                            .setValue(items[item].id)
                            .setEmoji(items[item].emoji)
                            .setLabel(items[item].name)
                    );
                }
            }

            const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new SelectMenuBuilder().setCustomId("item").setPlaceholder("item you want to sell").setOptions(options)
            );

            await msg.edit({ embeds: [embed], components: [row] });

            const filter = (i: Interaction) => i.user.id == message.author.id;

            const res = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (i) => {
                    await i.deferUpdate();
                    if (!i.isSelectMenu()) return;
                    return i.values[0];
                })
                .catch(() => {
                    msg.edit({ components: [] });
                });

            if (!res) return;

            selected = items[res];
        } else {
            embed.setDescription("what item would you like to sell?");

            await msg.edit({ embeds: [embed], components: [] });

            const filter = (m: Message) => message.author.id == m.author.id;

            let fail = false;

            const res = await msg.channel
                .awaitMessages({ filter, time: 30000, max: 1 })
                .then(async (m) => {
                    await m.first().delete();
                    return m.first().content;
                })
                .catch(() => {
                    fail = true;
                });

            if (fail) return;
            if (!res) return;

            let chosen;

            for (const itemName of Array.from(Object.keys(items))) {
                const aliases = items[itemName].aliases ? items[itemName].aliases : [];
                if (res == itemName) {
                    chosen = itemName;
                    break;
                } else if (res == itemName.split("_").join("")) {
                    chosen = itemName;
                    break;
                } else if (aliases.indexOf(res) != -1) {
                    chosen = itemName;
                    break;
                } else if (res == items[itemName].name) {
                    chosen = itemName;
                    break;
                }
            }

            selected = items[chosen];
        }

        if (!selected) {
            return message.channel.send({ embeds: [new ErrorEmbed("couldnt find that item")] });
        }

        if (!inventory[selected.id] || inventory[selected.id] == 0) {
            return message.channel.send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
        }

        embed.setDescription(`how many ${selected.emoji} ${selected.name} do you want to sell?`);

        await msg.edit({ embeds: [embed], components: [] });

        const filter = (m: Message) => m.author.id == message.author.id;

        let fail = false;
        let res = await msg.channel
            .awaitMessages({ filter, time: 30000, max: 1 })
            .then(async (m) => {
                await m.first().delete();
                return m.first().content;
            })
            .catch(async () => {
                fail = true;
                embed.setDescription("❌ expired");
                msg.edit({ embeds: [embed] });
            });

        if (fail) return;
        if (!res) return;

        if (!parseInt(res)) {
            fail = true;
        }

        if (isNaN(parseInt(res))) {
            fail = true;
        }

        if (parseInt(res) < 1) {
            fail = true;
        }

        if (fail) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        if (!inventory[selected.id]) {
            return message.channel.send({ embeds: [new ErrorEmbed(`you do not have this many ${selected.name}`)] });
        }

        if (inventory[selected.id] < parseInt(res)) {
            return message.channel.send({ embeds: [new ErrorEmbed(`you do not have this many ${selected.name}`)] });
        }

        const amount = parseInt(res);

        embed.setDescription(`how much do you want to sell ${amount}x ${selected.emoji} ${selected.name} for?`);

        await msg.edit({ embeds: [embed], components: [] });

        res = await msg.channel
            .awaitMessages({ filter, time: 30000, max: 1 })
            .then(async (m) => {
                await m.first().delete();
                return m.first().content;
            })
            .catch(async () => {
                fail = true;
                embed.setDescription("❌ expired");
                msg.edit({ embeds: [embed] });
            });

        if (fail) return;
        if (!res) return;

        if (!parseInt(res)) {
            fail = true;
        }

        if (isNaN(parseInt(res))) {
            fail = true;
        }

        if (parseInt(res) < 1) {
            fail = true;
        }

        if (fail) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        const cost = await formatBet(res, message.member).catch(() => {});

        if (!cost) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        if (cost <= 0) {
            return message.channel.send({
                embeds: [new ErrorEmbed("invalid amount")],
            });
        }

        inventory = await getInventory(message.member);

        if (!inventory[selected.id] || inventory[selected.id] < amount) {
            return message.channel.send({ embeds: [new CustomEmbed(message.member, "sneaky bitch")] });
        }

        inventory[selected.id] -= amount;

        if (inventory[selected.id] <= 0) {
            delete inventory[selected.id];
        }

        await setInventory(message.member, inventory);

        const url = await createAuction(message.member, selected.id, amount, cost).catch(() => {});

        if (url) {
            embed.setDescription(`[your auction has been created](${url})`);
        } else {
            embed.setDescription("there was an error while creating your auction");
        }

        return await msg.edit({ embeds: [embed] });
    };

    const auctions = await getAuctions(message.member);

    const embed = new CustomEmbed(message.member).setHeader("your auctions", message.author.avatarURL());

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    let currentPage = 0;
    const maxPage = auctions.length - 1;

    const displayAuction = (page: number) => {
        embed.setFields(
            {
                name: "item",
                value: `**${auctions[page].itemAmount}x** ${items[auctions[page].itemName].emoji} ${
                    items[auctions[page].itemName].name
                }`,
                inline: true,
            },
            {
                name: "cost",
                value: `$**${auctions[page].bin.toLocaleString()}**`,
                inline: true,
            },
            {
                name: "created",
                value: `<t:${Math.floor(auctions[page].createdAt.getTime() / 1000)}:R>`,
                inline: true,
            }
        );
        embed.setFooter({ text: `page ${page + 1}/${maxPage + 1}` });
    };

    if (auctions.length == 0) {
        embed.setDescription("you don't currently have any auctions");
    } else if (auctions.length > 1) {
        row.addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
        );

        displayAuction(0);
    } else {
        row.addComponents(new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger));
        displayAuction(0);
    }

    let max = 2;

    if (await isPremium(message.member)) {
        max += await getTier(message.member);
    }

    if (auctions.length < max) {
        row.addComponents(new ButtonBuilder().setLabel("create auction").setCustomId("y").setStyle(ButtonStyle.Success));
    }

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
        let fail = false;

        const response = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate();
                return { res: collected.customId, interaction: collected };
            })
            .catch(async () => {
                fail = true;
                await msg.edit({ embeds: [embed], components: [] });
            });

        if (fail) return;
        if (!response) return;

        const { res, interaction } = response;

        if (res == "y") {
            return createAuctionProcess(msg);
        } else if (res == "⬅") {
            if (currentPage == 0) {
                return pageManager();
            }

            currentPage--;

            displayAuction(currentPage);

            if (currentPage == 0) {
                row.setComponents(
                    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                );
            } else {
                row.setComponents(
                    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                );
            }

            await msg.edit({ embeds: [embed], components: [row] });
            return pageManager();
        } else if (res == "➡") {
            if (currentPage == maxPage) {
                return pageManager();
            }

            currentPage++;

            displayAuction(currentPage);

            if (currentPage == maxPage) {
                row.setComponents(
                    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                );
            } else {
                row.setComponents(
                    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                );
            }

            await msg.edit({ embeds: [embed], components: [row] });
            return pageManager();
        } else if (res == "del") {
            const res = await deleteAuction(auctions[currentPage].id, message.client as NypsiClient);

            if (res) {
                const inventory = await getInventory(message.member);

                if (inventory[auctions[currentPage].itemName]) {
                    inventory[auctions[currentPage].itemName] += auctions[currentPage].itemAmount;
                } else {
                    inventory[auctions[currentPage].itemName] = auctions[currentPage].itemAmount;
                }

                await setInventory(message.member, inventory);

                await interaction.followUp({
                    embeds: [new CustomEmbed(message.member, "✅ your auction has been deleted")],
                    ephemeral: true,
                });
            } else {
                await interaction.followUp({
                    embeds: [new CustomEmbed(message.member, "failed to delete that auction")],
                    ephemeral: true,
                });
            }

            return pageManager();
        }
    };

    return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
