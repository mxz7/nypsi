import { CommandInteraction, Message } from "discord.js";
import fetch from "node-fetch";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getLastfmUsername } from "../utils/users/utils";
import { getMember } from "../utils/functions/member";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command(
    "recenttracks",
    "view yours or another user's recently listened to songs",
    Categories.MUSIC
).setAliases(["recentsongs", "recents"]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "));
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const username = await getLastfmUsername(member);

    if (!username) {
        if (message.author.id == member.user.id) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(`you have not set your last.fm username (${await getPrefix(message.guild)}**slfm**)`),
                ],
            });
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("this user has not set their last.fm username")] });
        }
    }

    await addCooldown(cmd.name, message.member, 10);

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json());

    if (!res.recenttracks) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "no recent songs")] });
    }

    /**
     * @type {Array<{artist: {"#text": String}, name: String, "@attr": {nowplaying: Boolean}, url: String, date: {uts: String}}>}
     */
    let recenttracks = res.recenttracks.track;

    recenttracks = recenttracks.slice(0, 5);

    if (recenttracks.length == 0) {
        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "no recent songs")] });
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

    const embed = new CustomEmbed(message.member, false, msg).setTitle("recent songs");

    embed.setAuthor({ name: username, iconURL: member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }) });

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
