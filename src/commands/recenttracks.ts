import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getMember } from "../utils/functions/member";
import { getLastfmUsername } from "../utils/functions/users/lastfm";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "recenttracks",
  "view yours or another user's recently listened to songs",
  "music",
).setAliases(["recentsongs", "recents"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  let member;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const username = await getLastfmUsername(member);

  if (!username) {
    if (message.author.id == member.user.id) {
      return send({
        embeds: [
          new ErrorEmbed("you have not set your last.fm username (**/settings me lastfm**)"),
        ],
      });
    } else {
      return send({
        embeds: [new ErrorEmbed("this user has not set their last.fm username")],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 10);

  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`,
  ).then((res) => res.json());

  if (!res.recenttracks) {
    return send({ embeds: [new CustomEmbed(message.member, "no recent songs")] });
  }

  let recenttracks = res.recenttracks.track;

  recenttracks = recenttracks.slice(0, 5);

  if (recenttracks.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "no recent songs")] });
  }

  let msg = "";

  for (const track of recenttracks) {
    msg += `[${track.name}](${track.url}) - ${track.artist["#text"]}`;
    if (track["@attr"] && track["@attr"].nowplaying) {
      msg += "\n[currently playing]\n\n";
    } else {
      msg += `\n<t:${track.date.uts}:R>\n\n`;
    }
  }

  const embed = new CustomEmbed(message.member, msg).setTitle("recent songs");

  embed.setAuthor({ name: username, iconURL: member.user.displayAvatarURL({ size: 128 }) });

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
