import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("embed", "create an embed message", Categories.UTILITY).setPermissions(["MANAGE_MESSAGES"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return;
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("embed help")
            .addField("usage", `${prefix}embed <title> | (text) | (hex color)`)
            .addField(
                "help",
                "with this command you can create a simple embed message\n" + "**<>** required | **()** optional\n"
            )
            .addField(
                "examples",
                `${prefix}embed hello\n` +
                    `${prefix}embed hello | this is a description\n` +
                    `${prefix}embed hello | this is a description | #13c696`
            );

        return message.channel.send({ embeds: [embed] });
    }

    let mode = "";
    let color;

    if (!message.content.includes("|")) {
        mode = "title_only";
    } else if (args.join(" ").split("|").length == 2) {
        mode = "title_desc";
    } else if (args.join(" ").split("|").length == 3) {
        mode = "title_desc_color";
    }

    const title = args.join(" ").split("|")[0];
    let description;

    if (mode.includes("desc")) {
        description = args.join(" ").split("|")[1];
    }

    if (mode.includes("color")) {
        color = args.join(" ").split("|")[2];
    }

    const embed = new CustomEmbed(message.member).setTitle(title);

    if (mode.includes("desc")) {
        embed.setDescription(description);
    }

    if (color) {
        embed.setColor(color);
    }

    if (!(message instanceof Message)) return;

    message.channel
        .send({ embeds: [embed] })
        .then(() => {
            message.delete();
        })
        .catch((e) => {
            message.channel.send({ embeds: [new ErrorEmbed(e)] });
        });
}

cmd.setRun(run);

module.exports = cmd;
