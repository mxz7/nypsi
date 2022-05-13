import { CommandInteraction, Message } from "discord.js"
import fetch from "node-fetch"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import { getLastfmUsername } from "../utils/users/utils"
import { getMember } from "../utils/functions/member"
import { getPrefix } from "../utils/guilds/utils"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"

const cmd = new Command(
    "nowplaying",
    "view yours or another user's currently playing song using last.fm",
    Categories.INFO
).setAliases(["np"])

cmd.slashEnabled = true

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }
    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    let username: any = getLastfmUsername(member)

    if (!username) {
        if (message.author.id == member.user.id) {
            return send({
                embeds: [new ErrorEmbed(`you have not set your last.fm username (${getPrefix(message.guild)}**slfm**)`)],
            })
        } else {
            return send({ embeds: [new ErrorEmbed("this user has not set their last.fm username")] })
        }
    }

    await addCooldown(cmd.name, message.member, 10)

    username = username.username

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json())

    if (!res.recenttracks) {
        if (message.author.id == member.user.id) {
            if (res.error == 17) {
                return send({
                    embeds: [
                        new ErrorEmbed(`error: ${res.message}
                
                is your account set to private?`),
                    ],
                })
            }
            return send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    /**
     * @type {{artist: {"#text": String}, name: String, "@attr": {nowplaying: Boolean}, url: String, date: {uts: String}}}
     */
    const track = res.recenttracks.track[0]

    if (!track) {
        if (message.author.id == member.user.id) {
            return send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    if (!track["@attr"] || !track["@attr"].nowplaying) {
        if (message.author.id == member.user.id) {
            return send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    const embed = new CustomEmbed(message.member).setHeader("now playing")

    embed.setThumbnail(track.image[3]["#text"])

    embed.setDescription(`[${track.name}](${track.url}) - ${track.artist["#text"]}`)

    embed.setFooter({ text: username, iconURL: member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }) })

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
