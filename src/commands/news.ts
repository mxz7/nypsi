import { CommandInteraction, Message } from "discord.js";
import { formatDate } from "../utils/functions/date";
import { getNews, setNews } from "../utils/functions/news";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("news", "set the news for the help command", Categories.INFO);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (args.length == 0 || message.member.user.id != "672793821850894347") {
        const news = getNews();

        if (news.text == "") {
            return message.channel.send({ embeds: [new ErrorEmbed("no news has been set")] });
        }

        const lastSet = formatDate(news.date);

        const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

        return message.channel.send({ embeds: [embed] });
    } else {
        if (message.member.user.id != "672793821850894347") return;
        setNews(args.join(" "));

        const news = getNews();

        const lastSet = formatDate(news.date);

        const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

        return message.channel.send({ embeds: [embed] });
    }
}

cmd.setRun(run);

module.exports = cmd;
