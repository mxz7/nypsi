import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import prisma from "../utils/database/database";
import { createUser, getInventory, getItems, userExists } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("item", "view information about an item", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
    option.setName("item-global").setDescription("item you want to view info for").setAutocomplete(true).setRequired(true)
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

    if (!(await userExists(message.member))) await createUser(message.member);

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return send({ embeds: [new ErrorEmbed("/item <item>")] });
    }

    const items = getItems();

    const searchTag = args.join(" ").toLowerCase();

    let selected;

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : [];
        if (searchTag == itemName) {
            selected = itemName;
            break;
        } else if (searchTag == itemName.split("_").join("")) {
            selected = itemName;
            break;
        } else if (aliases.indexOf(searchTag) != -1) {
            selected = itemName;
            break;
        } else if (searchTag == items[itemName].name) {
            selected = itemName;
            break;
        }
    }

    selected = items[selected];

    if (!selected) {
        return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    await addCooldown(cmd.name, message.member, 7);

    const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

    let desc = `\`${selected.id}\`\n\n*${selected.description}*\n\n`;

    if (selected.buy) {
        desc += `**buy** $${selected.buy.toLocaleString()}\n`;
    }

    if (selected.sell) {
        desc += `**sell** $${selected.sell.toLocaleString()}\n`;
    }

    const auctions = await prisma.auction.findMany({
        where: {
            AND: [{ sold: true }, { itemName: selected.id }],
        },
        select: {
            bin: true,
            itemAmount: true,
        },
        take: 100,
    });

    const costs: number[] = [];

    for (const auction of auctions) {
        if (auction.itemAmount > 1) {
            costs.push(Math.floor(Number(auction.bin) / auction.itemAmount));
        } else {
            costs.push(Number(auction.bin));
        }
    }

    const sum = costs.reduce((a, b) => a + b, 0);
    const avg = sum / costs.length || 0;

    if (avg) {
        desc += `**average auction sale** $${Math.floor(avg).toLocaleString()}\n`;
    }

    if (selected.role) {
        embed.addField("role", `\`${selected.role}\``, true);
    }

    const rarityMap = new Map<number, string>();

    rarityMap.set(0, "common");
    rarityMap.set(1, "uncommon");
    rarityMap.set(2, "rare");
    rarityMap.set(3, "very rare");
    rarityMap.set(4, "exotic");

    if (selected.rarity) {
        embed.addField("rarity", `\`${rarityMap.get(selected.rarity)}\``, true);
    }

    const inventory = await getInventory(message.member);

    if (inventory[selected.id]) {
        embed.setFooter({
            text: `you have ${inventory[selected.id].toLocaleString()} ${selected.name}${
                inventory[selected.id] > 1 ? (selected.name.endsWith("s") ? "" : "s") : ""
            }`,
        });
    }

    embed.setDescription(desc);

    return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
