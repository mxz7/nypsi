import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import {
    getItems,
    getBalance,
    getInventory,
    updateBalance,
    setInventory,
    getMulti,
    userExists,
    createUser,
} from "../utils/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("sell", "sell items", Categories.MONEY);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) createUser(message.member);

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    "sell items from your inventory\n\ncoins have a set fee of **5**% per coin, while standard items have a **50**% fee"
                ),
            ],
        });
    }

    const items = getItems();
    const inventory = getInventory(message.member);

    const searchTag = args[0].toLowerCase();

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
        }
    }

    selected = items[selected];

    if (!selected) {
        return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    let amount = 1;

    if (args.length != 1) {
        if (args[1].toLowerCase() == "all") {
            args[1] = inventory[selected.id].toString();
        } else if (isNaN(parseInt(args[1])) || parseInt(args[1]) <= 0) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
        }
        amount = parseInt(args[1]);
    }

    if (!parseInt(amount.toString())) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!amount) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you dont have any " + selected.name)] });
    }

    if (amount > inventory[selected.id]) {
        return message.channel.send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.name}`)] });
    }

    await addCooldown(cmd.name, message.member, 10);

    inventory[selected.id] -= amount;

    if (inventory[selected.id] == 0) {
        delete inventory[selected.id];
    }

    setInventory(message.member, inventory);

    let sellWorth = Math.floor(selected.worth * 0.5 * amount);

    const multi = await getMulti(message.member);

    if (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable") {
        sellWorth = Math.floor(sellWorth + sellWorth * multi);
    } else if (selected.id == "ethereum" || selected.id == "bitcoin") {
        if (!selected.worth) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you cannot currently sell ${selected.name}`)],
            });
        }
        sellWorth = Math.floor(selected.worth * 0.95 * amount);
    } else if (!selected.worth) {
        sellWorth = 1000 * amount;
    }

    await updateBalance(message.member, (await getBalance(message.member)) + sellWorth);

    const embed = new CustomEmbed(message.member, false);

    embed.setDescription(
        `you sold **${amount}** ${selected.emoji} ${selected.name} for $${sellWorth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable")
                ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
                : selected.id == "bitcoin" || selected.id == "ethereum"
                ? "(-**5**% fee)"
                : ""
        }`
    );

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
