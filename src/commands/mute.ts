import { CommandInteraction, Message, PermissionFlagsBits, Role, ThreadChannel } from "discord.js";
import { profileExists, createProfile, newCase, newMute, isMuted, deleteMute, getMuteRole } from "../utils/moderation/utils";
import { inCooldown, addCooldown, getPrefix } from "../utils/guilds/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { PunishmentType } from "../utils/models/GuildStorage";
import { getExactMember } from "../utils/functions/member";
import ms = require("ms");
import dayjs = require("dayjs");

const cmd = new Command("mute", "mute one or more users", Categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
    "MODERATE_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData
    .addUserOption((option) => option.setName("user").setDescription("user to mute").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("reason for the mute"));

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return;
        }
    }

    if (!(await profileExists(message.guild))) await createProfile(message.guild);

    const send = async (data) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data);
        } else {
            return await message.channel.send(data);
        }
    };

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
        return send({
            embeds: [new ErrorEmbed("i need the `manage roles` and `manage channels` permission for this command to work")],
        });
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return send({
            embeds: [new ErrorEmbed("i need the `moderate members` permission for this command to work")],
        });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0 || !args[0]) {
        const embed = new CustomEmbed(message.member)
            .setHeader("mute help")
            .addField("usage", `${prefix}mute <@user(s)> (time) [-s]`)
            .addField(
                "help",
                "to mute multiple people in one command you just have to tag all of those you wish to be muted\nif the mute role isnt setup correctly this wont work"
            )
            .addField(
                "time format examples",
                "**1d** *1 day*\n**10h** *10 hours*\n**15m** *15 minutes*\n**30s** *30 seconds*"
            );
        return send({ embeds: [embed] });
    }

    if (args[0].length == 18 && message.mentions.members.first() == null) {
        let members;

        if (inCooldown(message.guild)) {
            members = message.guild.members.cache;
        } else {
            members = await message.guild.members.fetch();
            addCooldown(message.guild, 3600);
        }

        const member = members.find((m) => m.id == args[0]);

        if (!member) {
            return send({
                embeds: [new ErrorEmbed("unable to find member with ID `" + args[0] + "`")],
            });
        }

        message.mentions.members.set(member.user.id, member);
    } else if (message.mentions.members.first() == null) {
        const member = await getExactMember(message.guild, args[0]);

        if (!member) {
            return send({ embeds: [new ErrorEmbed("unable to find member `" + args[0] + "`")] });
        }

        message.mentions.members.set(member.user.id, member);
    }

    const members = message.mentions.members;
    let reason: string | string[] = "";

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
            args.shift();
        }
        reason = args.join(" ");
    }

    let count = 0;
    let mode = "role";
    const failed = [];

    let muteRole: Role = await message.guild.roles.fetch(await getMuteRole(message.guild));

    if (!(await getMuteRole(message.guild))) {
        muteRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
    }

    if (!muteRole) {
        if ((await getMuteRole(message.guild)) == "timeout") mode = "timeout";
    }

    if (!muteRole && mode == "role") {
        let channelError = false;
        try {
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

            message.guild.channels.cache.forEach(async (channel) => {
                if (channel instanceof ThreadChannel) return;
                await channel.permissionOverwrites
                    .edit(muteRole, {
                        SendMessages: false,
                        Speak: false,
                        AddReactions: false,
                    })
                    .catch(() => {
                        channelError = true;
                    });
            });
        } catch (e) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            });
        }
        if (channelError) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            });
        }
    }

    let timedMute = false;
    let unmuteDate: Date;
    let time = 0;

    if (reason != "") {
        time = getDuration(reason.split(" ")[0].toLowerCase());
        unmuteDate = new Date(Date.now() + time * 1000);

        if (time) {
            timedMute = true;
            reason = reason.split(" ");
            reason.shift();
            reason = reason.join(" ");
        }
    }

    if (mode == "timeout" && !timedMute) {
        unmuteDate = dayjs().add(1, "week").toDate();
        time = ms("1 week") / 1000;

        timedMute = true;
    }

    let fail = false;

    if (mode == "role") {
        for (const member of members.keys()) {
            if (members.get(member).user.id == message.client.user.id) {
                await message.channel.send({ content: "youll never shut me up 😏" });
                continue;
            }

            const targetHighestRole = members.get(member).roles.highest;
            const memberHighestRole = message.member.roles.highest;

            if (
                targetHighestRole.position >= memberHighestRole.position &&
                message.guild.ownerId != message.member.user.id
            ) {
                failed.push(members.get(member).user);
            } else if (members.get(member).roles.cache.find((r) => r.id == muteRole.id)) {
                if (Array.from(members.keys()).length == 1) {
                    return send({ embeds: [new ErrorEmbed("that user is already muted")] });
                }

                failed.push(members.get(member).user);
            } else {
                await members
                    .get(member)
                    .roles.add(muteRole)
                    .then(() => count++)
                    .catch(() => {
                        fail = true;
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "i am unable to give users the mute role - ensure my role is above the 'muted' role"
                                ),
                            ],
                        });
                    });
            }
            if (fail) break;
        }
    } else if (mode == "timeout") {
        for (const member of members.keys()) {
            if (members.get(member).user.id == message.client.user.id) {
                await message.channel.send({ content: "youll never shut me up 😏" });
                continue;
            }

            const targetHighestRole = members.get(member).roles.highest;
            const memberHighestRole = message.member.roles.highest;

            if (
                targetHighestRole.position >= memberHighestRole.position &&
                message.guild.ownerId != message.member.user.id
            ) {
                failed.push(members.get(member).user);
            } else if (members.get(member).isCommunicationDisabled()) {
                if (Array.from(members.keys()).length == 1) {
                    return send({ embeds: [new ErrorEmbed("that user is already muted")] });
                }

                failed.push(members.get(member).user);
            } else {
                await members
                    .get(member)
                    .disableCommunicationUntil(unmuteDate, reason)
                    .then(() => count++)
                    .catch(() => {
                        fail = true;
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "i am unable to timeout users, ensure my role is high enough and i have the permission"
                                ),
                            ],
                        });
                    });
            }
            if (fail) break;
        }
    }

    if (fail) return;

    let mutedLength = "";

    if (timedMute) {
        mutedLength = getTime(time * 1000);
    }

    if (count == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to mute any users")] });
    }

    const embed = new CustomEmbed(message.member, `✅ **${count}** member(s) muted`);

    if (timedMute) {
        if (count == 1 && failed.length == 0) {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been muted for **" + mutedLength + "**");
        } else {
            embed.setDescription("✅ **" + count + "** members muted for **" + mutedLength + "**");
        }
    } else {
        if (count == 1 && failed.length == 0) {
            embed.setDescription("✅ `" + members.first().user.tag + "` has been muted");
        } else {
            embed.setDescription("✅ **" + count + "** members muted");
        }
    }

    if (failed.length != 0) {
        const failedTags = [];
        for (const fail1 of failed) {
            failedTags.push(fail1.tag);
        }

        embed.addField("error", "unable to mute: " + failedTags.join(", "));
    }

    if (args.join(" ").includes("-s")) {
        if (message instanceof Message) {
            await message.delete();
            await message.member.send({ embeds: [embed] }).catch();
        } else {
            await message.reply({ embeds: [embed], ephemeral: true });
        }
    } else {
        await send({ embeds: [embed] });
    }

    let storeReason = reason;

    if (!timedMute) {
        storeReason = "[perm] " + reason;
    } else {
        storeReason = `[${mutedLength}] ${reason}`;
    }

    const members1 = Array.from(members.keys());

    if (failed.length != 0) {
        for (const fail1 of failed) {
            if (members1.includes(fail1.id)) {
                members1.splice(members1.indexOf(fail1.id), 1);
            }
        }
    }

    await newCase(message.guild, PunishmentType.MUTE, members1, message.author.tag, storeReason);

    for (const m of members1) {
        if (await isMuted(message.guild, members.get(m))) {
            await deleteMute(message.guild, members.get(m));
        }
    }

    if (timedMute) {
        await newMute(message.guild, members1, unmuteDate);
    }

    if (!timedMute) {
        await newMute(message.guild, members1, new Date(3130000000000));
    }

    if (args.join(" ").includes("-s")) return;
    for (const m of members1) {
        const mem = members.get(m);
        if (!timedMute) {
            const embed = new CustomEmbed(mem)
                .setTitle(`muted in ${message.guild.name}`)
                .addField("length", "`permanent`", true);

            if (reason != "") {
                embed.addField("reason", `\`${reason}\``, true);
            }

            await mem.send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] }).catch(() => {});
        } else {
            const embed = new CustomEmbed(mem)
                .setTitle(`muted in ${message.guild.name}`)
                .addField("length", `\`${mutedLength}\``, true)
                .setFooter({ text: "unmuted at:" })
                .setTimestamp(unmuteDate);

            if (reason != "") {
                embed.addField("reason", `\`${reason}\``, true);
            }

            await mem.send({ content: `you have been muted in ${message.guild.name}`, embeds: [embed] }).catch(() => {});
        }
    }
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration) {
    duration.toLowerCase();

    if (duration.includes("d")) {
        if (!parseInt(duration.split("d")[0])) return undefined;

        const num = duration.split("d")[0];

        return num * 86400;
    } else if (duration.includes("h")) {
        if (!parseInt(duration.split("h")[0])) return undefined;

        const num = duration.split("h")[0];

        return num * 3600;
    } else if (duration.includes("m")) {
        if (!parseInt(duration.split("m")[0])) return undefined;

        const num = duration.split("m")[0];

        return num * 60;
    } else if (duration.includes("s")) {
        if (!parseInt(duration.split("s")[0])) return undefined;

        const num = duration.split("s")[0];

        return num;
    }
}

function getTime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const daysms = ms % (24 * 60 * 60 * 1000);
    const hours = Math.floor(daysms / (60 * 60 * 1000));
    const hoursms = ms % (60 * 60 * 1000);
    const minutes = Math.floor(hoursms / (60 * 1000));
    const minutesms = ms % (60 * 1000);
    const sec = Math.floor(minutesms / 1000);

    let output = "";

    if (days > 0) {
        let a = " days";

        if (days == 1) {
            a = " day";
        }

        output = days + a;
    }

    if (hours > 0) {
        let a = " hours";

        if (hours == 1) {
            a = " hour";
        }

        if (output == "") {
            output = hours + a;
        } else {
            output = `${output} ${hours}${a}`;
        }
    }

    if (minutes > 0) {
        let a = " mins";

        if (minutes == 1) {
            a = " min";
        }

        if (output == "") {
            output = minutes + a;
        } else {
            output = `${output} ${minutes}${a}`;
        }
    }

    if (sec > 0) {
        output = output + sec + "s";
    }

    return output;
}
