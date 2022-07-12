import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getPrefix } from "../utils/guilds/utils";
import {
    isTracking,
    disableTracking,
    enableTracking,
    usernameProfileExists,
    createUsernameProfile,
} from "../utils/users/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("toggletracking", "toggle tracking your username and avatar changes", Categories.INFO);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!usernameProfileExists(message.member)) createUsernameProfile(message.member, message.author.tag);

    await addCooldown(cmd.name, message.member, 90);

    if (await isTracking(message.author.id)) {
        await disableTracking(message.author.id);
        return message.channel.send({
            embeds: [
                new CustomEmbed(message.member, false, "✅ username and avatar tracking has been disabled").setFooter(
                    `use ${getPrefix(message.guild)}(un/avh) -clear to clear your history`
                ),
            ],
        });
    } else {
        await enableTracking(message.author.id);
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ username and avatar tracking has been enabled")],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
