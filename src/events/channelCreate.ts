import { GuildChannel } from "discord.js";
import { getMuteRole } from "../utils/functions/moderation/mute";

export default async function channelCreate(channel: GuildChannel) {
  if (!channel.guild) return;

  if ((await getMuteRole(channel.guild)) == "timeout") return;

  let muteRole = channel.guild.roles.cache.get(await getMuteRole(channel.guild));

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
