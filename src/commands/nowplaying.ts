import { Message } from "discord.js"
const { default: fetch } = require("node-fetch")
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
const { getLastfmUsername } = require("../utils/users/utils")
import { getMember } from "../utils/utils"
import { getPrefix } from "../utils/guilds/utils"

const cmd = new Command("nowplaying", "view yours or another user's currently playing song", Categories.INFO).setAliases([
    "np",
])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    let username = getLastfmUsername(member)

    if (!username) {
        if (message.author.id == member.user.id) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you have not set your last.fm username (${getPrefix(message.guild)}**slfm**)`)],
            })
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("this user has not set their last.fm username")] })
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    username = username.username

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json())

    if (!res.recenttracks) {
        if (message.author.id == member.user.id) {
            if (res.error == 17) {
                return message.channel.send({
                    embeds: [
                        new ErrorEmbed(`error: ${res.message}
                
                is your account set to private?`),
                    ],
                })
            }
            return message.channel.send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    /**
     * @type {{artist: {"#text": String}, name: String, "@attr": {nowplaying: Boolean}, url: String, date: {uts: String}}}
     */
    const track = res.recenttracks.track[0]

    if (!track) {
        if (message.author.id == member.user.id) {
            return message.channel.send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    if (!track["@attr"] || !track["@attr"].nowplaying) {
        if (message.author.id == member.user.id) {
            return message.channel.send({ embeds: [new ErrorEmbed("you are not listening to a song")] })
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed(`${member.toString()} is not listening to a song`)] })
        }
    }

    const embed = new CustomEmbed(message.member, true).setTitle("now playing")

    embed.setThumbnail(track.image[3]["#text"])

    embed.setDescription(`[${track.name}](${track.url}) - ${track.artist["#text"]}`)

    embed.setAuthor({ name: username, iconURL: member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }) })

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
