import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import {
    getItems,
    getBalance,
    getInventory,
    getMaxBitcoin,
    getMaxEthereum,
    updateBalance,
    setInventory,
    userExists,
    createUser,
} from "../utils/economy/utils";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("buy", "buy items from the shop", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    `buy items from ${await getPrefix(message.guild)}shop by using the item id or item name without spaces`
                ),
            ],
        });
    }

    const items = getItems();
    const inventory = await getInventory(message.member);

    const searchTag = args[0].toLowerCase();

    let selectedName: string;

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : [];
        if (searchTag == itemName) {
            selectedName = itemName;
            break;
        } else if (searchTag == itemName.split("_").join("")) {
            selectedName = itemName;
            break;
        } else if (aliases.indexOf(searchTag) != -1) {
            selectedName = itemName;
            break;
        }
    }

    const selected = items[selectedName];

    if (!selected) {
        return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    if (
        !selected.worth ||
        selected.role == "collectable" ||
        selected.role == "prey" ||
        selected.role == "fish" ||
        selected.role == "car" ||
        selected.role == "sellable" ||
        selected.role == "ore"
    ) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this item")] });
    }

    let amount = 1;

    if (args.length != 1) {
        amount = parseInt(args[1]);
    }

    if (!amount) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > 50) amount = 50;

    if ((await getBalance(message.member)) < selected.worth * amount) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this")] });
    }

    await addCooldown(cmd.name, message.member, 7);

    if (selected.id == "bitcoin") {
        const owned = inventory["bitcoin"] || 0;
        const max = await getMaxBitcoin(message.member);

        if (owned + amount > max) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this much bitcoin yet")] });
        }
    } else if (selected.id == "ethereum") {
        const owned = inventory["ethereum"] || 0;
        const max = await getMaxEthereum(message.member);

        if (owned + amount > max) {
            return message.channel.send({ embeds: [new ErrorEmbed("you cannot buy this much ethereum yet")] });
        }
    }

    await updateBalance(message.member, (await getBalance(message.member)) - selected.worth * amount);
    inventory[selected.id] + amount;

    if (inventory[selected.id]) {
        inventory[selected.id] += amount;
    } else {
        inventory[selected.id] = amount;
    }

    await setInventory(message.member, inventory);

    return message.channel.send({
        embeds: [
            new CustomEmbed(
                message.member,
                `you have bought **${amount.toLocaleString()}** ${selected.emoji} ${selected.name} for $${(
                    selected.worth * amount
                ).toLocaleString()}`
            ),
        ],
    });
}

cmd.setRun(run);

module.exports = cmd;
