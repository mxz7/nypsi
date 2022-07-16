import { CommandInteraction, Message, Permissions, Role, ThreadChannel } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders";
import { getPrefix } from "../utils/guilds/utils";
import { setMuteRole, getMuteRole, createProfile, profileExists } from "../utils/moderation/utils";

const cmd = new Command("muterole", "set the muterole for the server", Categories.ADMIN).setPermissions(["MANAGE_SERVER"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
        }
        return;
    }

    const prefix = await getPrefix(message.guild);

    if (!(await profileExists(message.guild))) await createProfile(message.guild);

    const help = async () => {
        const current = await getMuteRole(message.guild);

        let role;

        if (current != "" && current != "timeout" && current) {
            role = await message.guild.roles.fetch(current);

            if (!role) {
                await setMuteRole(message.guild, "");
                role = undefined;
            }
        }

        let text = `${prefix}**muterole set <role>** *set the muterole for the server*\n${prefix}**muterole reset** *reset the mute role to default*\n${prefix}**muterole update** update mute permissions for every channel\n${prefix}**muterole timeout** use timeout mode instead of a role\n\n`;

        if (current == "timeout") {
            text += `currently using **timeout mode**, to use a role instead, use the ${prefix}**muterole reset** command`;
        } else {
            text += `current mute role: ${role ? role.toString() : "default"}`;
        }

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, text).setHeader("mute role")],
        });
    };

    if (args.length == 0) {
        return help();
    }

    if (args[0].toLowerCase() == "set") {
        if (args.length == 1) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        `${prefix}**muterole set <role>**\n\nyou can mention the role, use the role's ID or name`
                    ),
                ],
            });
        }

        const roles = message.guild.roles.cache;

        let role;

        if (message.mentions.roles.first()) {
            role = message.mentions.roles.first();
        } else if (args[1].length == 18 && parseInt(args[1])) {
            role = roles.find((r) => r.id == args[1]);
        } else {
            args.shift();
            role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));
        }

        if (!role) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)],
            });
        }

        await setMuteRole(message.guild, role);

        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `✅ muterole has been updated to ${role.toString()}\n\nnote: any currently muted users will be automatically unmuted. check these users with (${prefix}**muted**)`
                ),
            ],
        });
    } else if (args[0].toLowerCase() == "reset") {
        await setMuteRole(message.guild, "default");

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ muterole has been reset")],
        });
    } else if (args[0].toLowerCase() == "update") {
        let channelError = false;
        try {
            let muteRole = await message.guild.roles.fetch(await getMuteRole(message.guild));

            if ((await getMuteRole(message.guild)) == "") {
                muteRole = await message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
            }

            if (!muteRole) {
                const newMuteRole = await message.guild.roles
                    .create({
                        name: "muted",
                    })
                    .catch(() => {
                        channelError = true;
                    });

                if (newMuteRole instanceof Role) {
                    muteRole = newMuteRole;
                }
            }

            await message.guild.channels.cache.forEach(async (channel) => {
                if (channel instanceof ThreadChannel) return;
                await channel.permissionOverwrites
                    .edit(muteRole, {
                        SEND_MESSAGES: false,
                        SPEAK: false,
                        ADD_REACTIONS: false,
                    })
                    .catch(() => {
                        channelError = true;
                    });
            });
        } catch (e) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            });
        }
        if (channelError) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            });
        }

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ permissions were updated")],
        });
    } else if (args[0].toLowerCase() == "timeout") {
        await setMuteRole(message.guild, "timeout");

        const embed = new CustomEmbed(
            message.member,
            false,
            `✅ now using **timeout** mode\n\nnote: any currently muted users will be automatically unmuted. check these users with (${prefix}**muted**)`
        );

        return message.channel.send({
            embeds: [embed],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
