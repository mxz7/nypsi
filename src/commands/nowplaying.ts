import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getMember } from "../utils/functions/member";
import { getLastfmUsername } from "../utils/functions/users/lastfm";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "nowplaying",
  "view yours or another user's currently playing song using last.fm",
  "music",
).setAliases(["np"]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
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
      return send({ embeds: [new ErrorEmbed("this user has not set their last.fm username")] });
    }
  }

  await addCooldown(cmd.name, message.member, 10);

  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`,
  ).then((res) => res.json());

  if (!res.recenttracks) {
    if (message.author.id == member.user.id) {
      if (res.error == 17) {
        return send({
          embeds: [
            new ErrorEmbed(`error: ${res.message}
                
                is your account set to private?`),
          ],
        });
      }
      return send({ embeds: [new ErrorEmbed("you are not listening to a song")] });
    } else {
      return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] });
    }
  }

  const track = res.recenttracks.track[0];

  if (!track) {
    if (message.author.id == member.user.id) {
      return send({ embeds: [new ErrorEmbed("you are not listening to a song")] });
    } else {
      return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] });
    }
  }

  if (!track["@attr"] || !track["@attr"].nowplaying) {
    if (message.author.id == member.user.id) {
      return send({ embeds: [new ErrorEmbed("you are not listening to a song")] });
    } else {
      return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] });
    }
  }

  const embed = new CustomEmbed(message.member).setHeader(
    `${username} is listening to`,
    message.author.avatarURL(),
  );

  embed.setThumbnail(track.image[3]["#text"]);
  embed.setTitle(track.name);
  embed.setURL(track.url);
  embed.setDescription(`by ${track.artist["#text"]}`);

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
