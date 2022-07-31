import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { createUser, getInventory, setInventory, userExists } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command(
    "cook",
    "use your furnace to cook lovely rocks (doesnt remove your furnace because blue rocks are cool)",
    Categories.FUN
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!(await userExists(message.member))) await createUser(message.member);

    const inventory = await getInventory(message.member);

    let hasFurnace = false;

    if (inventory["furnace"] && inventory["furnace"] > 0) {
        hasFurnace = true;
    }

    if (!hasFurnace) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you need a furnace to cook. furnaces can be found in crates or bought from the shop")],
        });
    }

    await addCooldown(cmd.name, message.member, 1500);

    const amount = Math.floor(Math.random() * 4) + 1;

    if (inventory["blue_rocks"]) {
        inventory["blue_rocks"] += amount;
    } else {
        inventory["blue_rocks"] = amount;
    }

    await setInventory(message.member, inventory);

    const desc = `you produced **${amount}** blue rock${amount > 1 ? "s" : ""}!! <:nypsi_bluerock:1003408529954177144>`;

    return message.channel.send({
        embeds: [
            new CustomEmbed(message.member, desc).setHeader(`${message.author.username}'s lab`, message.author.avatarURL()),
        ],
    });
}

cmd.setRun(run);

module.exports = cmd;
