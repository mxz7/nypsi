import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import fetch from "node-fetch";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getLastfmUsername } from "../utils/users/utils";
import { getMember } from "../utils/functions/member";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const cmd = new Command(
    "nowplaying",
    "view yours or another user's currently playing song using last.fm",
    Categories.MUSIC
).setAliases(["np"]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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
        return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const username = await getLastfmUsername(member);

    if (!username) {
        if (message.author.id == member.user.id) {
            return send({
                embeds: [
                    new ErrorEmbed(`you have not set your last.fm username (${await getPrefix(message.guild)}**slfm**)`),
                ],
            });
        } else {
            return send({ embeds: [new ErrorEmbed("this user has not set their last.fm username")] });
        }
    }

    await addCooldown(cmd.name, message.member, 10);

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
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

    const embed = new CustomEmbed(message.member).setHeader(`${username} is listening to`, message.author.avatarURL());

    embed.setThumbnail(track.image[3]["#text"]);
    embed.setTitle(track.name);
    embed.setURL(track.url);
    embed.setDescription(`by ${track.artist["#text"]}`);

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
