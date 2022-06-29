import { CommandInteraction, Message } from "discord.js";
import { formatDate } from "../utils/functions/date";
import { getPeaks, inCooldown, addCooldown, runCheck } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("server", "view information about the server", Categories.INFO).setAliases([
    "serverinfo",
    "membercount",
]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const server = message.guild;

    runCheck(server);

    const created = formatDate(server.createdAt).toLowerCase();

    let members;

    if (inCooldown(server) || message.guild.memberCount == message.guild.members.cache.size) {
        members = server.members.cache;
    } else {
        members = await server.members.fetch();
        addCooldown(server, 3600);
    }

    const users = members.filter((member) => !member.user.bot);
    const bots = members.filter((member) => member.user.bot);

    if (args.length == 1 && args[0] == "-id") {
        const embed = new CustomEmbed(message.member).setHeader(server.name).setDescription("`" + server.id + "`");

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 1 && args[0] == "-m") {
        const embed = new CustomEmbed(message.member)
            .setThumbnail(server.iconURL({ format: "png", dynamic: true, size: 128 }))
            .setHeader(server.name)

            .addField(
                "member info",
                `**total** ${server.memberCount.toLocaleString()}\n` +
                    `**humans** ${users.size.toLocaleString()}\n` +
                    `**bots** ${bots.size.toLocaleString()}\n` +
                    `**member peak** ${getPeaks(message.guild).toLocaleString()}`
            );

        return message.channel.send({ embeds: [embed] });
    }

    const embed = new CustomEmbed(message.member)
        .setThumbnail(server.iconURL({ format: "png", dynamic: true, size: 128 }))
        .setHeader(server.name)

        .addField(
            "info",
            "**owner** " + server.members.cache.get(server.ownerId).user.tag + "\n" + "**created** " + created,
            true
        )

        .addField(
            "info",
            "**roles** " +
                server.roles.cache.size +
                "\n" +
                "**channels** " +
                server.channels.cache.size +
                "\n" +
                "**id** " +
                server.id,
            true
        )

        .addField(
            "member info",
            `**total** ${server.memberCount.toLocaleString()}\n` +
                `**humans** ${users.size.toLocaleString()}\n` +
                `**bots** ${bots.size.toLocaleString()}\n` +
                `**member peak** ${getPeaks(message.guild).toLocaleString()}`
        );

    if (server.memberCount >= 25000) {
        embed.setFooter("humans and bots may be inaccurate due to server size");
    }

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
