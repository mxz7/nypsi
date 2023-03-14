import { Guild, GuildMember, Message, TextChannel } from "discord.js";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { gamble } from "../../logger";
import { createGame } from "../economy/stats";
import { isPremium } from "../premium/premium";
import sleep from "../sleep";
import { getZeroWidth } from "../string";
import { addToNypsiBank, getTax } from "../tax";
import { getBlacklisted } from "./blacklisted";
import { add2ndPlace, add3rdPlace, addWin, createReactionStatsProfile, hasReactionStatsProfile } from "./stats";
import { currentChannels, getReactionSettings } from "./utils";
import { getWords } from "./words";

async function generateWord(guild: Guild) {
  const words = await getWords(guild);

  const chosenWord = words[Math.floor(Math.random() * words.length)];
  let displayWord = chosenWord;

  const zeroWidthCount = chosenWord.length / 2;

  const zeroWidthChar = getZeroWidth();

  for (let i = 0; i < zeroWidthCount; i++) {
    const pos = Math.floor(Math.random() * chosenWord.length + 1);

    displayWord = displayWord.substring(0, pos) + zeroWidthChar + displayWord.substring(pos);
  }

  return { actual: chosenWord, display: displayWord };
}

export async function startOpenChatReaction(guild: Guild, channel: TextChannel) {
  if (currentChannels.has(channel.id)) return "xoxo69";

  currentChannels.add(channel.id);

  const word = await generateWord(guild);

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  embed.setHeader("chat reaction");
  embed.setDescription(`type: \`${word.display}\``);

  let msg = await channel.send({ embeds: [embed] });

  const start = new Date().getTime();

  const winnersIDs: string[] = [];

  const blacklisted = await getBlacklisted(guild);

  const filter = async (m: Message) =>
    m.content.toLowerCase() == word.actual.toLowerCase() &&
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

      winnersText.push(`${pos} ${winner.user} in \`${winner.time}s\``);
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

export async function startChatReactionDuel(
  guild: Guild,
  channel: TextChannel,
  challenger: GuildMember,
  target: GuildMember,
  wager: number
): Promise<null | string> {
  const word = await generateWord(guild);

  const countdownMsg = await channel
    .send({
      embeds: [
        new CustomEmbed(challenger, `**wager** $${wager.toLocaleString()}\n\nstarting in 3 seconds`).setHeader(
          `${challenger.user.username} vs ${target.user.username}`
        ),
      ],
    })
    .catch(() => {});

  await sleep(1500);

  if (countdownMsg)
    await countdownMsg
      .edit({
        embeds: [
          new CustomEmbed(challenger, `**wager** $${wager.toLocaleString()}\n\nstarting in 2 seconds`).setHeader(
            `${challenger.user.username} vs ${target.user.username}`
          ),
        ],
      })
      .catch(() => {});

  await sleep(1500);

  if (countdownMsg)
    await countdownMsg
      .edit({
        embeds: [
          new CustomEmbed(challenger, `**wager** $${wager.toLocaleString()}\n\nstarting in 1 second`).setHeader(
            `${challenger.user.username} vs ${target.user.username}`
          ),
        ],
      })
      .catch(() => {});

  await sleep(1500);

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  embed.setHeader(`${challenger.user.username} vs ${target.user.username}`);
  embed.setDescription(`${wager > 0 ? ` **wager** $${wager.toLocaleString()}\n\n` : ""}type: \`${word.display}\``);

  if (countdownMsg && countdownMsg.deletable) await countdownMsg.delete().catch(() => {});

  const msg = await channel.send({ embeds: [embed] });

  const start = new Date().getTime();

  const filter = async (m: Message) => {
    const a = m.content.toLowerCase() == word.actual.toLowerCase();
    const b = [challenger.user.id, target.user.id].includes(m.author.id);

    return a && b;
  };

  let fail = false;

  const winningMessage = await channel
    .awaitMessages({
      filter,
      time: 30000,
      max: 1,
    })
    .then((messages) => messages.first())
    .catch(() => {
      fail = true;
    });

  if (fail || !winningMessage) {
    embed.addField("winner", "nobody won... losers.");

    await msg.edit({ embeds: [embed] });
    return null;
  }

  let winnings = wager * 2;
  let tax = 0;

  if (winnings > 1_000_000 && !(await isPremium(winningMessage.author.id))) {
    tax = await getTax();

    const taxed = Math.floor(winnings * tax);
    await addToNypsiBank(taxed);
    winnings -= taxed;
  }

  embed.addField(
    "winner",
    `🏅 ${winningMessage.author.toString()} in \`${((Date.now() - start) / 1000).toFixed(2)}s\`${
      winnings > 0 ? `\n\n+$**${winnings.toLocaleString()}**${tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""}` : ""
    }`
  );

  const gameId = await createGame({
    bet: wager,
    game: "chatreactionduel",
    outcome: `${winningMessage.author.tag} won in ${((Date.now() - start) / 1000).toFixed(2)}s`,
    userId: challenger.user.id,
    win: winningMessage.author.id === challenger.user.id,
    earned: winningMessage.author.id === challenger.user.id ? winnings : 0,
  });

  await createGame({
    bet: wager,
    game: "chatreactionduel",
    outcome: `${winningMessage.author.tag} won in ${((Date.now() - start) / 1000).toFixed(2)}s`,
    userId: target.user.id,
    win: winningMessage.author.id === target.user.id,
    earned: winningMessage.author.id === target.user.id ? winnings : 0,
  });

  gamble(
    challenger.user,
    "chatreactionduel",
    wager,
    winningMessage.author.id == challenger.user.id,
    gameId,
    winningMessage.author.id == challenger.user.id ? winnings : null
  );
  gamble(
    target.user,
    "chatreactionduel",
    wager,
    winningMessage.author.id == target.user.id,
    gameId,
    winningMessage.author.id == target.user.id ? winnings : null
  );

  embed.setFooter({ text: `id: ${gameId}` });

  await msg.edit({ embeds: [embed] });

  return winningMessage.author.id;
}
