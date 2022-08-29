import { Channel, CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { createProfile, getModLogsHook, profileExists, setModLogs } from "../utils/moderation/utils";

const cmd = new Command("modlogs", "set/update the modlogs channel", Categories.MODERATION).setPermissions([
    "MANAGE_SERVER",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
        }
        return;
    }

    if (
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
        !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage webhooks` and `manage channels` permissions for this command")],
        });
    }

    const prefix = await getPrefix(message.guild);

    if (!(await profileExists(message.guild))) await createProfile(message.guild);

    const help = async () => {
        const current = await getModLogsHook(message.guild);

        const embed = new CustomEmbed(message.member);

        embed.setHeader("mod logs");

        let text = "";

        if (!current) {
            text += `mod logs have not been enabled\n\nuse ${prefix}**modlogs <channel>** to enable them`;
        } else {
            const msg = await current.send({ content: "fetching channel..." });

            const channel = await message.guild.channels.fetch(msg.channel_id);

            text += `current channel: ${
                channel ? channel.toString() : `${msg.channel_id}`
            }\n\n${prefix}**modlogs disable** disables modlogs\n${prefix}**modlogs <channel>** to change the channel`;
        }

        embed.setDescription(text);

        return await message.channel.send({ embeds: [embed] });
    };

    if (args.length == 0) {
        return help();
    } else if (args[0].toLowerCase() == "disable") {
        await setModLogs(message.guild, "");

        return message.channel.send({ embeds: [new CustomEmbed(message.member, "✅ modlogs have been disabled")] });
    } else {
        let channel: string | Channel = args[0];

        if (channel.length != 18) {
            if (!message.mentions.channels.first()) {
                return message.channel.send({
                    embeds: [
                        new ErrorEmbed(
                            "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name"
                        ),
                    ],
                });
            } else {
                channel = message.mentions.channels.first();
            }
        } else {
            channel = message.guild.channels.cache.find((ch) => ch.id == channel);
        }

        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }

        if (!channel.isTextBased()) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid cahnnel")] });
        }

        if (channel.isDMBased()) return;

        if (channel.isThread()) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid cahnnel")] });
        }

        let fail = false;

        const hook = await channel
            .createWebhook({
                name: "nypsi",
                avatar: "https://i.imgur.com/4CnL3aP.png",
            })
            .catch(() => {
                fail = true;
                message.channel.send({
                    embeds: [new ErrorEmbed("i was unable to make a webhook in that channel, please check my permissions")],
                });
            });

        if (fail) return;
        if (!hook) return;

        await setModLogs(message.guild, hook.url);

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, `✅ modlogs set to ${channel.toString()}`)],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;
