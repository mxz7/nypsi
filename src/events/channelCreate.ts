import { GuildChannel } from "discord.js";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { LogType } from "../utils/models/GuildStorage";
import { addLog, getMuteRole, isLogsEnabled, profileExists } from "../utils/moderation/utils";

export default async function channelCreate(channel: GuildChannel) {
  if (!channel.guild) return;

  if (await isLogsEnabled(channel.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("channel created");
    embed.setDescription(
      `${channel.toString()} \`${channel.id}\`\n\n**name** ${channel.name}\n**category** ${channel.parent.name}\n**type** ${
        channel.type
      }`
    );

    await addLog(channel.guild, LogType.CHANNEL, embed);
  }

  if (!(await profileExists(channel.guild))) return;

  if ((await getMuteRole(channel.guild)) == "timeout") return;

  let muteRole = await channel.guild.roles.fetch(await getMuteRole(channel.guild));

  if (!(await getMuteRole(channel.guild))) {
    muteRole = channel.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
  }

  if (!muteRole) return;

  channel.permissionOverwrites
    .edit(muteRole, {
      SendMessages: false,
      Speak: false,
      AddReactions: false,
    })
    .catch(() => {});
}
