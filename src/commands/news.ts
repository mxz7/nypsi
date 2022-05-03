import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import { getNews, formatDate, setNews } from "../utils/utils"

const cmd = new Command("news", "set the news for the help command", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (args.length == 0 || message.member.user.id != "672793821850894347") {
        const news = getNews()

        if (news.text == "") {
            return message.channel.send({ embeds: [new ErrorEmbed("no news has been set")] })
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
