import { CommandInteraction, Message, Permissions } from "discord.js";
import { getPrefix, setPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("prefix", "change the bot's prefix", Categories.ADMIN).setPermissions(["MANAGE_GUILD"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const prefix = await getPrefix(message.guild);

    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
        }
        return;
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(
            message.member,
            "current prefix: `" + prefix + "`\n\nuse " + prefix + "**prefix** <new prefix> to change the current prefix"
        ).setHeader("prefix");

        return message.channel.send({ embeds: [embed] });
    }

    if (args.join(" ").length > 3) {
        return message.channel.send({ embeds: [new ErrorEmbed("prefix cannot be longer than 3 characters")] });
    }

    await setPrefix(message.guild, args.join(" "));

    const embed = new CustomEmbed(message.member, "✅ prefix changed to `" + args.join(" ") + "`").setHeader("prefix");

    return await message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
