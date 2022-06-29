import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getMember } from "../utils/functions/member";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("ddos", "ddos other users (fake)", Categories.FUN).setAliases(["hitoff"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("$ddos <user>")] });
    }

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args[0]);
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const ip = `${randNumber()}.${randNumber()}.${randNumber()}.${randNumber()}`;
    const port = `${randPort()}`;

    await addCooldown(cmd.name, message.member, 7);

    const embed = new CustomEmbed(
        message.member,
        true,
        member.user.toString() +
            "\n\n" +
            "**ip** *obtaining..*" +
            "\n" +
            "**port** *waiting...*" +
            "\n\n" +
            "**status** *online*"
    ).setHeader("ddos tool");

    return message.channel.send({ embeds: [embed] }).then((m) => {
        embed.setDescription(
            member.user.toString() +
                "\n\n" +
                `**ip** *${ip}*` +
                "\n" +
                "**port** *scanning..*" +
                "\n\n" +
                "**status** *online*"
        );

        setTimeout(() => {
            m.edit({ embeds: [embed] }).then(() => {
                embed.setDescription(
                    member.user.toString() +
                        "\n\n" +
                        `**ip** *${ip}*` +
                        "\n" +
                        `**port** *${port}*` +
                        "\n\n" +
                        "**status** *online*"
                );

                setTimeout(() => {
                    m.edit({ embeds: [embed] }).then(() => {
                        embed.setDescription(
                            member.user.toString() +
                                "\n\n" +
                                `**ip** *${ip}*` +
                                "\n" +
                                `**port** *${port}*` +
                                "\n\n" +
                                "**status** *offline*"
                        );
                        embed.setColor("#5efb8f");

                        setTimeout(() => {
                            m.edit({ embeds: [embed] });
                        }, 1000);
                    });
                }, 1000);
            });
        }, 1000);
    });
}

function randNumber() {
    return Math.floor(Math.random() * 254) + 1;
}

function randPort() {
    return Math.floor(Math.random() * 25565);
}

cmd.setRun(run);

module.exports = cmd;
