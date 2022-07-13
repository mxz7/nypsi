import { CommandInteraction, Message, Permissions } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { profileExists, createProfile, newCase, deleteBan } from "../utils/moderation/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { logger } from "../utils/logger";
import { PunishmentType } from "../utils/models/GuildStorage";

const cmd = new Command("unban", "unban one or more users", Categories.MODERATION).setPermissions(["BAN_MEMBERS"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
    option.setName("user").setDescription("tag/id of user to unban").setRequired(true)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
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

    if (!message.member.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return send({ embeds: [new ErrorEmbed("you need the `ban members` permission")] });
        }
        return;
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) {
        return send({
            embeds: [new ErrorEmbed("i need the `ban members` permission for this command to work")],
        });
    }

    if (!(await profileExists(message.guild))) await createProfile(message.guild);

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("unban help")
            .addField("usage", `${prefix}unban <user(s)> [-s]`)
            .addField(
                "help",
                "**<>** required | **[]** parameter\n" +
                    "**<users>** you can unban one or more members in one command\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible"
            )
            .addField(
                "examples",
                `${prefix}unban user#1234 **(only works if members are in cache)**\n${prefix}unban 123456789012345678\n${prefix}unban 123456789012345678 123456789012345678 -s`
            );

        return send({ embeds: [embed] });
    }

    const members = [];
    const failed = [];

    for (const arg of args) {
        if (arg.length == 18) {
            await message.guild.members
                .unban(arg, message.member.user.tag)
                .then(async (user) => {
                    members.push(user);
                    await deleteBan(message.guild, arg);
                })
                .catch(() => {
                    failed.push(arg);
                });
        } else if (arg.toLowerCase() != "-s") {
            try {
                const memberCache = message.client.users.cache;

                const findingMember = memberCache.find((m) => (m.username + "#" + m.discriminator).includes(arg));

                if (findingMember) {
                    const id = findingMember.id;
                    await message.guild.members
                        .unban(id, message.member.user.tag)
                        .then(async (user) => {
                            members.push(user);
                            await deleteBan(message.guild, user.id);
                        })
                        .catch(() => {
                            failed.push(arg);
                        });
                }
            } catch (e) {
                logger.error(e);
            }
        }
    }

    if (members.length == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to unban any users")] });
    }

    const embed = new CustomEmbed(message.member);

    if (members.length == 1) {
        embed.setDescription("✅ `" + members[0].username + "#" + members[0].discriminator + "` was unbanned");
    } else {
        embed.setDescription("✅ **" + members.length + "** members have been unbanned");
    }

    if (failed.length != 0) {
        embed.addField("error", "unable to unban: " + failed.join(", "));
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

    const members1 = [];

    for (const m of members) {
        members1.push(m.id);
    }

    await newCase(message.guild, PunishmentType.UNBAN, members1, message.member.user.tag, message.content);
}

cmd.setRun(run);

module.exports = cmd;
