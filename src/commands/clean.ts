import { getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { Message, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command("clean", "clean up bot commands and responses", Categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!message.channel.isTextBased()) return;

    if (message.channel.isDMBased()) return;

    await addCooldown(cmd.name, message.member, 15);

    const prefix = await getPrefix(message.guild);

    const collected = await message.channel.messages.fetch({ limit: 50 });

    const collecteda = collected.filter((msg) => msg.author.id == message.client.user.id || msg.content.startsWith(prefix));

    await message.channel.bulkDelete(collecteda);
}

cmd.setRun(run);

module.exports = cmd;
