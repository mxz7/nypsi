import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { getItems, userExists, getInventory, setInventory } from "../utils/economy/utils";
import { inCooldown, addCooldown } from "../utils/guilds/utils";
import { logger } from "../utils/logger";

const cmd = new Command("crateall", "give every user in the current guild a crate", Categories.NONE).setPermissions([
    "bot owner",
]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (message.member.user.id != "672793821850894347") return;

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("u know how this works")] });
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

    if (selected.role != "crate") {
        return message.channel.send({ embeds: [new ErrorEmbed(`${selected.name} is not a crate`)] });
    }

    let members;

    if (
        inCooldown(message.guild) ||
        message.guild.memberCount == message.guild.members.cache.size ||
        message.guild.memberCount <= 50
    ) {
        members = message.guild.members.cache;
    } else {
        members = await message.guild.members.fetch();
        addCooldown(message.guild, 3600);
    }

    let amount = 1;

    if (args[1]) {
        amount = parseInt(args[1]);
    }

    let count = 0;

    for (let m of members.keys()) {
        m = members.get(m);

        if (!(await userExists(m))) continue;

        const inventory = getInventory(m);

        if (inventory[selected.id]) {
            inventory[selected.id] += amount;
        } else {
            inventory[selected.id] = amount;
        }

        setInventory(m, inventory);
        logger.info(`${amount} ${selected.id} given to ${m.user.tag} (${m.user.id})`);
        count += amount;
    }

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, `**${count}** ${selected.name}${count != 1 ? "s" : ""} given`)],
    });
}

cmd.setRun(run);

module.exports = cmd;
