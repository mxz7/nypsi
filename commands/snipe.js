const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils.js")

module.exports = {
    name: "snipe",
    description: "snipe the most recently deleted message",
    category: "fun",
    run: async (message, args) => {
        const { snipe } = require("../nypsi.js")

        let channel = message.channel.id

        if (args.length == 1) {
            if (!message.mentions.channels.first()) {
                return message.channel.send("❌ invalid channel")
            }
            channel = message.mentions.channels.first().id
            if (!channel) {
                return message.channel.send("❌ invalid channel")
            }
        }

        if (!snipe || !snipe.get(channel)) {
            return message.channel.send("❌ nothing to snipe")
        }

        let content = snipe.get(channel).content

        if (content) {
            if (snipe.get(channel).attachments.url) {
                content = snipe.get(channel).attachments.url
            }
        }

        const created = new Date(snipe.get(channel).createdTimestamp)

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setColor(color)
            .setTitle(snipe.get(channel).member.user.tag)
            .setDescription(content)

            .setFooter(timeSince(created) + " ago")
        
        message.channel.send(embed)

    }
}

function timeSince(date) {

    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor((daysms) / (60*60*1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor((minutesms) / (1000))

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
  }