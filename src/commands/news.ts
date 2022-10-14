import { CommandInteraction, Message } from "discord.js";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getNews, setNews } from "../utils/functions/news";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("news", "set the news for the help command", Categories.INFO);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (args.length == 0 || message.member.user.id != Constants.TEKOH_ID) {
    const news = await getNews();

    if (news.text == "") {
      return message.channel.send({ embeds: [new ErrorEmbed("no news has been set")] });
    }

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return message.channel.send({ embeds: [embed] });
  } else {
    if (message.member.user.id != Constants.TEKOH_ID) return;
    await setNews(args.join(" "));

    const news = await getNews();

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
