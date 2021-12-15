const { Message } = require("discord.js")
const { default: fetch } = require("node-fetch")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { getLastfmUsername } = require("../utils/users/utils")
const { getMember } = require("../utils/utils")
const { lastfm: apiKey } = require("../config.json")

const cmd = new Command("recenttracks", "view yours or another user's recently listened to songs", categories.INFO).setAliases(["recentsongs", "recents"])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

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
            return message.channel.send({embeds: [new ErrorEmbed("you have not set your last.fm username ($**slfm**)")]})
        } else {
            return message.channel.send({embeds: [new ErrorEmbed("this user has not set their last.fm username")]})
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    username = username.username

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${apiKey}&format=json`
    ).then((res) => res.json())

    /**
     * @type {Array<{artist: {"#text": String}, name: String, "@attr": {nowplaying: Boolean}, url: String, date: {uts: String}}>}
     */
    let recenttracks = res.recenttracks.track

    recenttracks = recenttracks.slice(0, 5)

    let msg = ""

    for (const track of recenttracks) {
        msg += `[${track.name}](${track.url}) - ${track.artist["#text"]}`
        if (track["@attr"] && track["@attr"].nowplaying) {
            msg += "\n[currently playing]\n\n"
        } else {
            msg += `\n<t:${track.date.uts}:R>\n\n`
        }
    }

    const embed = new CustomEmbed(message.member, false, msg).setTitle("recent songs")

    embed.setAuthor(username, member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return message.channel.send({embeds: [embed]})
}

cmd.setRun(run)

module.exports = cmd