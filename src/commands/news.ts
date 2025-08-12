import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getNews, setNews } from "../utils/functions/news";

const cmd = new Command("news", "set the news for the help command", "info");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (args.length == 0 || message.author.id != Constants.OWNER_ID) {
    const news = await getNews();

    if (news.text == "") {
      return send({ embeds: [new ErrorEmbed("no news has been set")] });
    }

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return send({ embeds: [embed] });
  } else {
    if (message.author.id != Constants.OWNER_ID) return;
    await setNews(args.join(" "));

    const news = await getNews();

    const lastSet = formatDate(news.date);

    const embed = new CustomEmbed(message.member, `${news.text}\n\nset on: ${lastSet}`);

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
