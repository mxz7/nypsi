import { GuildChannel } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { getMuteRole } from "../utils/functions/moderation/mute";

export default async function channelCreate(channel: GuildChannel) {
  if (!channel.guild) return;

  if (await isLogsEnabled(channel.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setTitle("channel created");
    embed.setDescription(
      `${channel.toString()} \`${channel.id}\`\n\n**name** ${channel.name}\n${
        channel.parent ? `**category** ${channel.parent.name}\n` : ""
      }**type** ${channel.type}`,
    );

    await addLog(channel.guild, "channel", embed);
  }

  if ((await getMuteRole(channel.guild)) == "timeout") return;

  let muteRole = await channel.guild.roles.cache.get(await getMuteRole(channel.guild));

  if (!(await getMuteRole(channel.guild))) {
    muteRole = channel.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
  }

  if (!muteRole) return;

  channel.permissionOverwrites
    .edit(muteRole, {
      SendMessages: false,
      Speak: false,
      AddReactions: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    })
    .catch(() => {});
}
