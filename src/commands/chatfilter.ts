import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { getChatFilter, updateChatFilter, getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("chatfilter", "change the chat filter for your server", Categories.ADMIN)
    .setAliases(["filter"])
    .setPermissions(["MANAGE_SERVER"]);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
        }
        return;
    }

    let filter = await getChatFilter(message.guild);

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, "`" + filter.join("`\n`") + "`")
            .setHeader("current chat filter")
            .setFooter({ text: `use ${prefix}filter (add/del/+/-) to modify the filter` });

        if (filter.length == 0) {
            embed.setDescription("`❌` empty chat filter");
        }

        return message.channel.send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
        if (args.length == 1) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(`${prefix}filter add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`),
                ],
            });
        }

        const word = args[1]
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[^A-z0-9\s]/g, "");

        if (word == "" || word == " ") {
            return message.channel.send({ embeds: [new ErrorEmbed("word must contain letters or numbers")] });
        }

        if (filter.indexOf(word) > -1) {
            const embed = new CustomEmbed(message.member, "❌ `" + word + "` already exists in the filter")
                .setHeader("chat filter")
                .setFooter({ text: `you can use ${prefix}filter to view the filter` });

            return message.channel.send({ embeds: [embed] });
        }

        filter.push(word);

        if (filter.join("").length > 1000) {
            filter.splice(filter.indexOf(word), 1);

            const embed = new CustomEmbed(
                message.member,
                `❌ filter has exceeded the maximum size - please use *${prefix}filter del/-* or *${prefix}filter reset*`
            ).setHeader("chat filter");

            return message.channel.send({ embeds: [embed] });
        }

        await updateChatFilter(message.guild, filter);

        const embed = new CustomEmbed(message.member, "✅ added `" + word + "` to the filter").setHeader("chat filter");
        return message.channel.send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}filter del/- <word>`)] });
        }

        const word = args[1]
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[^A-z0-9\s]/g, "");

        if (filter.indexOf(word) > -1) {
            filter.splice(filter.indexOf(word), 1);
        } else {
            const embed = new CustomEmbed(message.member, "❌ `" + word + "` not found in the filter")
                .setHeader("chat filter")
                .setFooter({ text: `you can use ${prefix}filter to view the filter` });

            return message.channel.send({ embeds: [embed] });
        }

        await updateChatFilter(message.guild, filter);

        const embed = new CustomEmbed(message.member, "✅ removed `" + word + "` from the filter")
            .setHeader("chat filter")
            .setFooter({ text: `you can use ${prefix}filter reset to reset the filter` });

        return message.channel.send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "reset") {
        filter = [];

        await updateChatFilter(message.guild, filter);

        const embed = new CustomEmbed(message.member, "✅ filter has been reset").setHeader("chat filter");

        return message.channel.send({ embeds: [embed] });
    }
}

cmd.setRun(run);

module.exports = cmd;
