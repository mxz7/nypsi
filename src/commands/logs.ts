import { Channel, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getLogsChannelHook, setLogsChannelHook } from "../utils/functions/moderation/logs";

const cmd = new Command("logs", "set/update the logs channel", "admin").setPermissions([
  "MANAGE_SERVER",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you need the `manage server` permission")],
      });
    }
    return;
  }

  if (
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return message.channel.send({
      embeds: [
        new ErrorEmbed(
          "i need the `manage webhooks` and `manage channels` permissions for this command",
        ),
      ],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];

  const help = async () => {
    const current = await getLogsChannelHook(message.guild);

    const embed = new CustomEmbed(message.member);

    embed.setHeader("logs");

    let text = "";

    if (!current) {
      text += `logs have not been enabled\n\nuse ${prefix}**logs <channel>** to enable them`;
    } else {
      const msg = await current.send({ content: "fetching channel..." });

      const channel = await message.guild.channels.cache.get(msg.channel_id);

      text += `current channel: ${
        channel ? channel.toString() : `${msg.channel_id}`
      }\n\n${prefix}**logs disable** disables logs\n${prefix}**logs <channel>** to change the channel`;
    }

    embed.setDescription(text);

    return await message.channel.send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "disable") {
    await setLogsChannelHook(message.guild, null);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ logs have been disabled")],
    });
  } else {
    let channel: string | Channel = args[0];

    if (!message.guild.channels.cache.get(args[0])) {
      if (!message.mentions.channels.first()) {
        return message.channel.send({
          embeds: [
            new ErrorEmbed(
              "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name",
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
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (channel.isDMBased()) return;

    if (channel.isThread()) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    let fail = false;

    const hook = await channel
      .createWebhook({
        name: "nypsi",
        avatar: "https://file.maxz.dev/Rec9ZpcmMJ.png",
      })
      .catch(() => {
        fail = true;
        message.channel.send({
          embeds: [
            new ErrorEmbed(
              "i was unable to make a webhook in that channel, please check my permissions",
            ),
          ],
        });
      });

    if (fail) return;
    if (!hook) return;

    await setLogsChannelHook(message.guild, hook.url);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `✅ logs set to ${channel.toString()}`)],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
