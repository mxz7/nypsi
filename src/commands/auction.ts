import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    InteractionReplyOptions,
    InteractionResponse,
    Message,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageOptions,
    SelectMenuBuilder,
    SelectMenuOptionBuilder,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    createAuction,
    deleteAuction,
    formatBet,
    getAuctionByMessage,
    getAuctions,
    getInventory,
    getItems,
    setInventory,
    userExists,
} from "../utils/economy/utils";
import requestDM from "../utils/functions/requestdm";
import { logger } from "../utils/logger";
import { NypsiClient } from "../utils/models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { Item } from "../utils/models/Economy";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getTier, isPremium } from "../utils/premium/utils";

const cmd = new Command("auction", "create and manage your item auctions", Categories.MONEY).setAliases(["ah"]);

cmd.slashEnabled = true;
cmd.slashData
    .addSubcommand((manage) => manage.setName("manage").setDescription("manage your current auctions"))
    .addSubcommand((create) =>
        create
            .setName("create")
            .setDescription("create an auction")
            .addStringOption((option) =>
                option.setName("item").setDescription("item you would like to sell").setAutocomplete(true).setRequired(true)
            )
            .addStringOption((option) =>
                option.setName("amount").setDescription("amount of items you would like to sell").setRequired(true)
            )
            .addStringOption((option) =>
                option.setName("cost").setDescription("amount you would like this item to sell for").setRequired(true)
            )
    );

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

    const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data);
        } else {
            if (msg instanceof InteractionResponse) return;
            return await msg.edit(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 15);

    const items = getItems();

    const createAuctionProcess = async (msg: Message) => {
        const embed = new CustomEmbed(message.member).setHeader("create an auction", message.author.avatarURL());

        let inventory = await getInventory(message.member);

        if (Object.keys(inventory).length == 0) {
            embed.setDescription("you have nothing in your inventory");
            return edit({ embeds: [embed], components: [] }, msg);
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

            await edit({ embeds: [embed], components: [row] }, msg);

            const filter = (i: Interaction) => i.user.id == message.author.id;

            const res = await msg
                .awaitMessageComponent({ filter, time: 30000 })
                .then(async (i) => {
                    await i.deferUpdate();
                    if (!i.isSelectMenu()) return;
                    return i.values[0];
                })
                .catch(() => {
                    edit({ components: [] }, msg);
                });

            if (!res) return;

            selected = items[res];
        } else {
            embed.setDescription("what item would you like to sell?");

            await edit({ embeds: [embed], components: [] }, msg);

            const filter = (m: Message) => message.author.id == m.author.id;

            let fail = false;

            const res = await msg.channel
                .awaitMessages({ filter, time: 30000, max: 1 })
                .then(async (m) => {
                    await m.first().delete();
                    return m.first().content.toLowerCase();
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

        await edit({ embeds: [embed], components: [] }, msg);

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
                edit({ embeds: [embed] }, msg);
            });

        if (fail) return;
        if (!res) return;

        if (res.toLowerCase() === "all") {
            res = inventory[selected.id].toString();
        }

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

        await edit({ embeds: [embed], components: [] }, msg);

        res = await msg.channel
            .awaitMessages({ filter, time: 30000, max: 1 })
            .then(async (m) => {
                await m.first().delete();
                return m.first().content;
            })
            .catch(async () => {
                fail = true;
                embed.setDescription("❌ expired");
                edit({ embeds: [embed] }, msg);
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

        if (cost > 15000000) {
            return message.channel.send({ embeds: [new ErrorEmbed("this is too much")] });
        }

        const shopCost = (items[selected.id].buy || 0) * amount;

        if (shopCost != 0 && cost > shopCost) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        `you can buy ${amount}x ${selected.emoji} ${
                            selected.name
                        } from nypsi's shop for $${shopCost.toLocaleString()}`
                    ),
                ],
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

        return await edit({ embeds: [embed] }, msg);
    };

    if (args.length == 0 || args[0].toLowerCase() == "manage") {
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
                    await edit({ embeds: [embed], components: [] }, msg);
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
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
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

                await edit({ embeds: [embed], components: [row] }, msg);
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
                        new ButtonBuilder()
                            .setCustomId("➡")
                            .setLabel("next")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                } else {
                    row.setComponents(
                        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger)
                    );
                }

                await edit({ embeds: [embed], components: [row] }, msg);
                return pageManager();
            } else if (res == "del") {
                const res = await deleteAuction(auctions[currentPage].id, message.client as NypsiClient).catch(() => {});

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

                await edit({ components: [] }, msg);
            }
        };

        return pageManager();
    } else if (args[0].toLowerCase() == "del") {
        if (message.guild.id != "747056029795221513") return;

        const roles = message.member.roles.cache;

        let allow = false;

        if (roles.has("747056620688900139")) allow = true;
        if (roles.has("747059949770768475")) allow = true;
        if (roles.has("845613231229370429")) allow = true;

        if (!allow) return;

        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed("use the message id dumbass")] });
        }

        const auction = await getAuctionByMessage(args[1]);

        if (!auction) return message.channel.send({ embeds: [new ErrorEmbed("invalid auction bro")] });

        await deleteAuction(auction.id, message.client as NypsiClient);

        await (message as Message).react("✅");

        if (!(await userExists(auction.ownerId))) return;

        const inventory = await getInventory(auction.ownerId);

        if (inventory[auction.itemName]) {
            inventory[auction.itemName] += auction.itemAmount;
        } else {
            inventory[auction.itemName] = auction.itemAmount;
        }

        await setInventory(auction.ownerId, inventory);

        const embed = new CustomEmbed().setColor("#36393f");

        embed.setDescription(
            `your auction for ${auction.itemAmount}x ${items[auction.itemName].emoji} ${
                items[auction.itemName].name
            } has been removed by a staff member. you have been given back your item${auction.itemAmount > 1 ? "s" : ""}`
        );

        await requestDM({
            client: message.client as NypsiClient,
            content: "your auction has been removed by a staff member",
            memberId: auction.ownerId,
            embed: embed,
        });

        logger.info(`auction ${auction.id} by ${auction.ownerId} deleted by ${message.author.tag} (${message.author.id})`);
        return;
    } else if (args[0].toLowerCase() == "create") {
        if (args.length != 4) {
            return send({ embeds: [new ErrorEmbed("please use /auction create to create auctions in a command")] });
        }

        let maxAuctions = 2;

        if (await isPremium(message.member)) {
            maxAuctions += await getTier(message.member);
        }

        const auctions = await getAuctions(message.member);

        if (auctions.length >= maxAuctions) {
            return send({
                embeds: [new ErrorEmbed(`you have reached your maximum (\`${maxAuctions}\`) amount of auctions`)],
            });
        }

        const items = getItems();

        let chosen: string;

        for (const itemName of Array.from(Object.keys(items))) {
            const aliases = items[itemName].aliases ? items[itemName].aliases : [];
            if (args[1].toLowerCase() == itemName) {
                chosen = itemName;
                break;
            } else if (args[1].toLowerCase() == itemName.split("_").join("")) {
                chosen = itemName;
                break;
            } else if (aliases.indexOf(args[1].toLowerCase()) != -1) {
                chosen = itemName;
                break;
            } else if (args[1].toLowerCase() == items[itemName].name) {
                chosen = itemName;
                break;
            }
        }

        const selected = items[chosen];

        if (!selected) {
            return send({ embeds: [new ErrorEmbed("couldnt find that item")] });
        }

        const inventory = await getInventory(message.member);

        if (!inventory[selected.id] || inventory[selected.id] == 0) {
            return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
        }

        if (args[2].toLowerCase() == "all") {
            args[2] = inventory[selected.id].toString();
        }

        if (!parseInt(args[2]) || isNaN(parseInt(args[2]))) {
            return send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        const amount = parseInt(args[2]);

        if (amount < 1) {
            return send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        if (inventory[selected.id] < amount) {
            return send({ embeds: [new ErrorEmbed(`you dont have this many ${selected.name}`)] });
        }

        const cost = await formatBet(args[3].toLowerCase(), message.member).catch(() => {});

        if (!cost) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
        }

        if (cost <= 0) {
            return send({
                embeds: [new ErrorEmbed("invalid amount")],
            });
        }

        if (cost > 15000000) {
            return send({ embeds: [new ErrorEmbed("this is too much")] });
        }

        const shopCost = (items[selected.id].buy || 0) * amount;

        if (shopCost != 0 && cost > shopCost) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `you can buy ${amount}x ${selected.emoji} ${
                            selected.name
                        } from nypsi's shop for $${shopCost.toLocaleString()}`
                    ),
                ],
            });
        }

        inventory[selected.id] -= amount;

        if (inventory[selected.id] <= 0) {
            delete inventory[selected.id];
        }

        await setInventory(message.member, inventory);

        const url = await createAuction(message.member, selected.id, amount, cost).catch(() => {});

        let desc: string;

        if (url) {
            desc = `[your auction has been created](${url})`;
        } else {
            desc = "there was an error while creating your auction";
        }

        return await send({ embeds: [new CustomEmbed(message.member, desc)] });
    }
}

cmd.setRun(run);

module.exports = cmd;
