import { Guild, Message, TextChannel } from "discord.js";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getZeroWidth } from "../string";
import { getBlacklisted } from "./blacklisted";
import { add2ndPlace, add3rdPlace, addWin, createReactionStatsProfile, hasReactionStatsProfile } from "./stats";
import { currentChannels, getReactionSettings } from "./utils";
import { getWords } from "./words";

export async function startOpenChatReaction(guild: Guild, channel: TextChannel) {
  if (currentChannels.has(channel.id)) return "xoxo69";

  currentChannels.add(channel.id);

  const words = await getWords(guild);

  const chosenWord = words[Math.floor(Math.random() * words.length)];
  let displayWord = chosenWord;

  const zeroWidthCount = chosenWord.length / 2;

  const zeroWidthChar = getZeroWidth();

  for (let i = 0; i < zeroWidthCount; i++) {
    const pos = Math.floor(Math.random() * chosenWord.length + 1);

    displayWord = displayWord.substring(0, pos) + zeroWidthChar + displayWord.substring(pos);
  }

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  embed.setHeader("chat reaction");
  embed.setDescription(`type: \`${displayWord}\``);

  let msg = await channel.send({ embeds: [embed] });

  const start = new Date().getTime();

  const winnersIDs: string[] = [];

  const blacklisted = await getBlacklisted(guild);

  const filter = async (m: Message) =>
    m.content.toLowerCase() == chosenWord.toLowerCase() &&
    winnersIDs.indexOf(m.author.id) == -1 &&
    !m.member.user.bot &&
    blacklisted.indexOf(m.author.id) == -1;

  const timeout = (await getReactionSettings(guild)).timeout;

  const collector = channel.createMessageCollector({
    filter,
    max: 3,
    time: timeout * 1000,
  });

  const winnersList: { user: string; time: string }[] = [];
  const winnersText: string[] = [];
  const medals = new Map<number, string>();

  medals.set(1, "🥇");
  medals.set(2, "🥈");
  medals.set(3, "🥉");

  let ended = false;

  const updateWinnersText = () => {
    winnersText.length = 0;

    for (const winner of winnersList) {
      if (winnersText.length >= 3) break;
      const pos = medals.get(winnersList.indexOf(winner) + 1);

      winnersText.push(`${pos} ${winner.user} in \`${winner.time}\``);
    }
  };

  const interval = setInterval(async () => {
    if (winnersList.length == winnersText.length) return;

    setTimeout(() => {
      if (ended) return;
      ended = true;

      collector.emit("end");
      clearInterval(interval);
    }, 10000);

    updateWinnersText();

    if (embed.data.fields?.length == 0) {
      embed.addField("winners", winnersText.join("\n"));
    } else {
      embed.setFields([{ name: "winners", value: winnersText.join("\n") }]);
    }

    msg = await msg.edit({ embeds: [embed] });

    if (winnersList.length == 3) {
      clearInterval(interval);
    }
  }, 750);

  collector.on("collect", async (message): Promise<void> => {
    let time: number | string = new Date().getTime();

    time = ((time - start) / 1000).toFixed(2);

    winnersList.push({ user: message.author.toString(), time: time });

    winnersIDs.push(message.author.id);

    if (!(await hasReactionStatsProfile(guild, message.member))) await createReactionStatsProfile(guild, message.member);

    switch (winnersList.length) {
      case 1:
        await addWin(guild, message.member);
        break;
      case 2:
        await add2ndPlace(guild, message.member);
        break;
      case 3:
        await add3rdPlace(guild, message.member);
        break;
    }

    return;
  });

  collector.on("end", () => {
    currentChannels.delete(channel.id);
    ended = true;
    setTimeout(async () => {
      clearInterval(interval);
      if (winnersList.length == 0) {
        embed.setDescription(embed.data.description + "\n\nnobody won ):");
      } else {
        if (winnersList.length == 1) {
          embed.setFooter({ text: "ended with 1 winner" });
        } else {
          embed.setFooter({ text: `ended with ${winnersList.length} winners` });
        }
        updateWinnersText();

        if (embed.data.fields?.length == 0) {
          embed.addField("winners", winnersText.join("\n"));
        } else {
          embed.setFields([{ name: "winners", value: winnersText.join("\n") }]);
        }
      }

      await msg.edit({ embeds: [embed] }).catch(() => {});
    }, 1000);
  });
}
