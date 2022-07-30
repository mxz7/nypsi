import { CommandInteraction, Message } from "discord.js";
import { createUser, getItems, getMulti, userExists } from "../utils/economy/utils";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("worth", "check the worth of items", Categories.MONEY).setAliases(["price"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    if (args.length == 0) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(`${await getPrefix(message.guild)}worth <item> (amount)\n\ncalculates the worth of an item`),
            ],
        });
    }

    const items = getItems();

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
        amount = parseInt(args[1]);
    }

    if (!amount || isNaN(amount)) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > 250) amount = 250;

    let worth = Math.floor(selected.sell * amount);

    const multi = await getMulti(message.member);

    if (selected.role == "fish" || selected.role == "prey") {
        worth = Math.floor(worth + worth * multi);
    } else if (selected.id == "ethereum" || selected.id == "bitcoin") {
        if (!selected.sell) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you cannot currently sell ${selected.name}`)],
            });
        }
        worth = Math.floor(selected.sell * 0.95 * amount);
    } else if (!selected.sell) {
        worth = 1000 * amount;
    }

    const embed = new CustomEmbed(message.member);

    embed.setDescription(
        `${amount} ${selected.emoji} **${selected.name}** is worth $${worth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey")
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
