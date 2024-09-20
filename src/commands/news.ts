import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getNews, setNews } from "../utils/functions/news";

const cmd = new Command("news", "set the news for the help command", "info");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (args.length == 0 || message.author.id != Constants.TEKOH_ID) {
    const news = await getNews();

    if (news.text == "") {
      return message.channel.send({ embeds: [new ErrorEmbed("no news has been set")] });
    }

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return message.channel.send({ embeds: [embed] });
  } else {
    if (message.author.id != Constants.TEKOH_ID) return;
    await setNews(args.join(" "));

    const news = await getNews();

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
