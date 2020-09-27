const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getColor, getMember } = require("../utils/utils")

const cmd = new Command("spotify", "show information about what you're playing on spotify", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let member;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = getMember(message, args.join(" "));
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send("❌ invalid user");
    }

    if (member.presence.activities.length < 1) {
        return message.channel.send("❌ not currently playing spotify")
    }

    let activity

    for (a of member.presence.activities) {
        if (a.name.toLowerCase() == "spotify") {
            activity = a
            break
        }
    }

    if (!activity) {
        return message.channel.send("❌ not currently playing spotify")
    }

    const color = getColor(member)

    let duration = activity.timestamps.end.getTime() - activity.timestamps.start.getTime()
    duration = getTime(duration)

    const image = `https://i.scdn.co/image/${activity.assets.largeImage.slice(8)}`
    const url = `https://open.spotify.com/track/${activity.syncID}`
    const name = activity.details
    const artist = activity.state
    const album = activity.assets.largeText

    const embed = new MessageEmbed()
        .setTitle(member.user.tag)
        .setColor(color)
        .setThumbnail(image)
        .setDescription(`[\`listen on spotify\`](${url})`)
        .addField("song", `${name} **-** ${artist}`, true)
        .addField("duration", `\`${duration}\``, true)
        .addField("album", album, true)
        .setFooter("bot.tekoh.wtf")

    return message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd

function getTime(ms) {
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    let sec = Math.floor((minutesms) / (1000))

    if (sec.toString().length == 1) sec = `0${sec}`

    output = `${minutes}:${sec}`

    return output
}