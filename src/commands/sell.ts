import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    createUser,
    getBalance,
    getInventory,
    getItems,
    getMulti,
    setInventory,
    updateBalance,
    userExists,
} from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("sell", "sell items", Categories.MONEY);

cmd.slashEnabled = true;
cmd.slashData
    .addStringOption((option) =>
        option.setName("item").setRequired(true).setAutocomplete(true).setDescription("item you want to sell")
    )
    .addIntegerOption((option) => option.setMinValue(1).setName("amount").setDescription("amount you want to sell"));

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

    if (args.length == 0) {
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    "sell items from your inventory\n\ncoins have a set fee of **5**% per coin, while standard items have a **50**% fee"
                ),
            ],
        });
    }

    const items = getItems();
    const inventory = await getInventory(message.member);

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
        return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
    }

    let amount = 1;

    if (args.length != 1) {
        if (args[1].toLowerCase() == "all") {
            args[1] = inventory[selected.id].toString();
        } else if (isNaN(parseInt(args[1])) || parseInt(args[1]) <= 0) {
            return send({ embeds: [new ErrorEmbed("invalid amount")] });
        }
        amount = parseInt(args[1]);
    }

    if (!parseInt(amount.toString())) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!amount) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return send({ embeds: [new ErrorEmbed("you dont have any " + selected.name)] });
    }

    if (amount > inventory[selected.id]) {
        return send({ embeds: [new ErrorEmbed(`you don't have enough ${selected.name}`)] });
    }

    await addCooldown(cmd.name, message.member, 5);

    inventory[selected.id] -= amount;

    if (inventory[selected.id] == 0) {
        delete inventory[selected.id];
    }

    await setInventory(message.member, inventory);

    let sellWorth = Math.floor(selected.sell * amount);

    const multi = await getMulti(message.member);

    if (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable") {
        sellWorth = Math.floor(sellWorth + sellWorth * multi);
    } else if (selected.id == "ethereum" || selected.id == "bitcoin") {
        if (!selected.sell) {
            return send({
                embeds: [new ErrorEmbed(`you cannot currently sell ${selected.name}`)],
            });
        }
        sellWorth = Math.floor(selected.sell * 0.95 * amount);
    } else if (!selected.sell) {
        sellWorth = 1000 * amount;
    }

    await updateBalance(message.member, (await getBalance(message.member)) + sellWorth);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(
        `you sold **${amount}** ${selected.emoji} ${selected.name} for $${sellWorth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey" || selected.role == "sellable")
                ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
                : selected.id == "bitcoin" || selected.id == "ethereum"
                ? "(-**5**% fee)"
                : ""
        }`
    );

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
