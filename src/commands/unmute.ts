import {
    CommandInteraction,
    GuildMember,
    InteractionReplyOptions,
    Message,
    MessageOptions,
    PermissionFlagsBits,
} from "discord.js";
import { getExactMember } from "../utils/functions/member";
import { addCooldown, getPrefix, inCooldown } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import { PunishmentType } from "../utils/models/GuildStorage";
import { createProfile, deleteMute, getMuteRole, isMuted, newCase, profileExists } from "../utils/moderation/utils";

const cmd = new Command("unmute", "unmute one or more users", Categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
    "MODERATE_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("user to unmute").setRequired(true));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return;
        }
    }

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
        return send({
            embeds: [new ErrorEmbed("i need the `manage roles` and `manage channels` permission for this command to work")],
        });
    }

    if (!(await profileExists(message.guild))) await createProfile(message.guild);

    const prefix = await getPrefix(message.guild);

    if (args.length == 0 || !args[0]) {
        return send({ embeds: [new ErrorEmbed(`${prefix}unmute <@user(s)>`)] });
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

    let muteRole = await message.guild.roles.fetch(await getMuteRole(message.guild));
    let mode = "role";

    if (!muteRole) {
        const roles = await message.guild.roles.fetch();
        muteRole = roles.find((r) => r.name.toLowerCase() == "muted");
    }

    if (!muteRole) {
        if ((await getMuteRole(message.guild)) == "timeout") mode = "timeout";
    }

    if (!muteRole && mode == "role") {
        return send({
            embeds: [
                new ErrorEmbed(
                    `no mute role could be found, set one with ${prefix}muterole, or create a role called "muted"`
                ),
            ],
        });
    }

    let count = 0;
    let fail = false;
    const failed = [];

    if (mode == "role") {
        for (const member of message.mentions.members.keys()) {
            const m = message.mentions.members.get(member);

            if (m.roles.cache.has(muteRole.id)) {
                await m.roles
                    .remove(muteRole)
                    .then(() => count++)
                    .catch(() => {
                        fail = true;
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "there was an error when removing the role, please ensure i have the correct permissions"
                                ),
                            ],
                        });
                    });
            } else {
                failed.push(m.user);
            }
            if (fail) break;
        }
    } else if (mode == "timeout") {
        for (const member of message.mentions.members.keys()) {
            const m: GuildMember = message.mentions.members.get(member);

            if (m.isCommunicationDisabled()) {
                await m
                    .disableCommunicationUntil(null)
                    .then(() => count++)
                    .catch(() => {
                        fail = true;
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "there was an error when unmuting the user, please ensure i have the correct permissions"
                                ),
                            ],
                        });
                    });
            } else {
                // @ts-expect-error weird??
                failed.push(m.user);
            }
            if (fail) break;
        }
    }

    if (fail) return;

    const embed = new CustomEmbed(message.member, "✅ **" + count + "** member(s) unmuted");

    if (count == 1) {
        embed.setDescription("✅ `" + message.mentions.members.first().user.tag + "` has been unmuted");
    }

    if (count == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to unmute any users")] });
    }

    if (failed.length != 0) {
        const failedTags = [];
        for (const fail1 of failed) {
            failedTags.push(fail1.tag);
        }

        embed.addField("error", "unable to unmute: " + failedTags.join(", "));
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

    const members1 = Array.from(members.keys());

    if (failed.length != 0) {
        for (const fail1 of failed) {
            if (members1.includes(fail1.id)) {
                members1.splice(members1.indexOf(fail1.id), 1);
            }
        }
    }

    for (const m of members1) {
        if (await isMuted(message.guild, members.get(m))) {
            await deleteMute(message.guild, members.get(m));
        }
    }

    await newCase(message.guild, PunishmentType.UNMUTE, members1, message.author.tag, message.content);
}

cmd.setRun(run);

module.exports = cmd;
