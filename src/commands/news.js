const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/models/EmbedBuilders.js")
const { getNews, formatDate, setNews } = require("../utils/utils")

const cmd = new Command("news", "set the news for the help command", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (args.length == 0 || message.member.user.id != "672793821850894347") {
        const news = getNews()

        if (news.text == "") {
            return message.channel.send(new ErrorEmbed("no news has been set"))
        }

        const lastSet = formatDate(news.date)

        const embed = new CustomEmbed(message.member, false, `${news.text}\n\nset on: ${lastSet}`)

        return message.channel.send({ embeds: [embed] })
    } else {
        if (message.member.user.id != "672793821850894347") return
        setNews(args.join(" "))

        const news = getNews()

        const lastSet = formatDate(news.date)

        const embed = new CustomEmbed(message.member, false, `${news.text}\n\nset on: ${lastSet}`)

        return message.channel.send({ embeds: [embed] })
    }
}

cmd.setRun(run)

module.exports = cmd
