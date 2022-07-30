import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { createUser, getInventory, setInventory, userExists } from "../utils/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command(
    "bake",
    "use your furnace to bake cookies and cakes! (doesnt remove your furnace because cookies are cool)",
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
            embeds: [new ErrorEmbed("you need a furnace to bake. furnaces can be found in crates or bought from the shop")],
        });
    }

    await addCooldown(cmd.name, message.member, 900);

    const amount = Math.floor(Math.random() * 4) + 1;

    if (inventory["cookie"]) {
        inventory["cookie"] += amount;
    } else {
        inventory["cookie"] = amount;
    }

    const chance = Math.floor(Math.random() * 15);

    if (chance == 7) {
        if (inventory["cake"]) {
            inventory["cake"] += 1;
        } else {
            inventory["cake"] = 1;
        }
    }

    await setInventory(message.member, inventory);

    let desc = `you baked **${amount}** cookies!! 🍪`;

    if (chance == 7) {
        desc += "\n\nyou also managed to bake a cake <:nypsi_cake:1002977512630001725> good job!!";
    }

    return message.channel.send({
        embeds: [
            new CustomEmbed(message.member, desc).setHeader(
                `${message.author.username}'s bakery`,
                message.author.avatarURL()
            ),
        ],
    });
}

cmd.setRun(run);

module.exports = cmd;
