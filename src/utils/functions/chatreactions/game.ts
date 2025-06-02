import { Guild, GuildMember, Message, TextChannel, User } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { CustomEmbed, getColor } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { gamble } from "../../logger";
import { addProgress } from "../economy/achievements";
import { addBalance } from "../economy/balance";
import { createGame } from "../economy/stats";
import { addTaskProgress } from "../economy/tasks";
import { topChatReactionGlobal } from "../economy/top";
import { isPremium } from "../premium/premium";
import sleep from "../sleep";
import { getZeroWidth, pluralize } from "../string";
import { addToNypsiBank, getTax } from "../tax";
import { getBlacklisted } from "./blacklisted";
import { add2ndPlace, add3rdPlace, addLeaderboardEntry, addWin } from "./stats";
import { getReactionSettings } from "./utils";
import { getWordListType, getWords } from "./words";

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

export async function startOpenChatReaction(guild: Guild, channel: TextChannel, forced: boolean) {
  const word = await generateWord(guild);
  const wordListType = await getWordListType(guild);

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  const winners: { user: User; time: number }[] = [];
  const winnersText: string[] = [];
  const medals = new Map<number, string>();
  medals.set(1, "🥇");
  medals.set(2, "🥈");
  medals.set(3, "🥉");

  embed.setHeader("chat reaction");
  embed.setDescription(`type: \`${word.display}\``);

  const blacklisted = await getBlacklisted(guild);

  const filter = async (m: Message) => {
    m.content = m.content.replaceAll("’", "'").replaceAll("”", "'").replaceAll("‘", "'");
    return (
      m.content.toLowerCase() == word.actual.toLowerCase() &&
      !winners.find((i) => i.user.id === m.author.id) &&
      !m.member.user.bot &&
      blacklisted.indexOf(m.author.id) == -1
    );
  };

  const timeout = (await getReactionSettings(guild)).timeout;

  let msg = await channel.send({ embeds: [embed] });

  const collector = channel.createMessageCollector({
    filter,
    max: 3,
    time: timeout * 1000,
  });

  let ended = false;

  const updateWinnersText = () => {
    winnersText.length = 0;

    for (const winner of winners) {
      if (winnersText.length >= 3) break;
      const pos = medals.get(winners.indexOf(winner) + 1);

      winnersText.push(`${pos} ${winner.user.toString()} in \`${winner.time.toFixed(2)}s\``);
    }
  };

  const interval = setInterval(async () => {
    if (winners.length == winnersText.length) return;

    setTimeout(() => {
      if (ended) return;
      ended = true;

      collector.emit("end");
      clearInterval(interval);
    }, 10000);

    updateWinnersText();

    embed.setFields([
      { name: `${pluralize("winner", winnersText.length)}`, value: winnersText.join("\n") },
    ]);

    msg = await msg.edit({ embeds: [embed] });

    if (winners.length == 3) {
      clearInterval(interval);
    }
  }, 750);

  const discordStart = msg.createdTimestamp;

  collector.on("collect", async (message): Promise<void> => {
    const time = (message.createdTimestamp - discordStart) / 1000;

    winners.push({ user: message.author, time: time });

    inPlaceSort(winners).asc((i) => i.time);

    setTimeout(async () => {
      switch (winners.findIndex((i) => i.user.id === message.author.id)) {
        case 0:
          await addWin(guild, message.member);
          message.react("🥇");
          break;
        case 1:
          await add2ndPlace(guild, message.member);
          message.react("🥈");
          break;
        case 2:
          await add3rdPlace(guild, message.member);
          message.react("🥉");
          break;
      }
    }, 500);

    if (!forced && wordListType !== "custom") {
      const update = await addLeaderboardEntry(message.author.id, time).catch(() => ({
        daily: false,
        global: false,
      }));

      if (update.global) {
        const pos = await topChatReactionGlobal(message.author.id, false, 5000, true);

        const embed = new CustomEmbed(message.member);
        embed.setDescription(`you've set a new **personal best** ${pos ? ` (#${pos})` : ""}`);

        setTimeout(() => {
          message.reply({ embeds: [embed] });
        }, 1000);
      }
    }

    return;
  });

  collector.on("end", () => {
    ended = true;
    setTimeout(async () => {
      clearInterval(interval);
      if (winners.length == 0) {
        embed.setDescription(embed.data.description + "\n\nnobody won ):");
      } else {
        if (winners.length == 1) {
          embed.setFooter({ text: "ended with 1 winner" });
        } else {
          if (winners.length === 3) {
            await addProgress(winners[0].user.id, "fast_typer", 1);
            await addTaskProgress(winners[0].user.id, "chat_reaction_daily");
            await addTaskProgress(winners[0].user.id, "chat_reaction_weekly");
          }
          embed.setFooter({ text: `ended with ${winners.length} winners` });
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
  wager: number,
): Promise<null | { winner: string; winnings: number }> {
  const word = await generateWord(guild);

  const countdownMsg = await channel
    .send({
      embeds: [
        new CustomEmbed(
          challenger,
          `**wager** $${wager.toLocaleString()}\n\nstarting in 3 seconds`,
        ).setHeader(`${challenger.user.username} vs ${target.user.username}`),
      ],
    })
    .catch(() => {});

  await sleep(1500);

  if (countdownMsg)
    await countdownMsg
      .edit({
        embeds: [
          new CustomEmbed(
            challenger,
            `**wager** $${wager.toLocaleString()}\n\nstarting in 2 seconds`,
          ).setHeader(`${challenger.user.username} vs ${target.user.username}`),
        ],
      })
      .catch(() => {});

  await sleep(1500);

  if (countdownMsg)
    await countdownMsg
      .edit({
        embeds: [
          new CustomEmbed(
            challenger,
            `**wager** $${wager.toLocaleString()}\n\nstarting in 1 second`,
          ).setHeader(`${challenger.user.username} vs ${target.user.username}`),
        ],
      })
      .catch(() => {});

  await sleep(1500);

  const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

  embed.setHeader(`${challenger.user.username} vs ${target.user.username}`);
  embed.setDescription(
    `${wager > 0 ? ` **wager** $${wager.toLocaleString()}\n\n` : ""}type: \`${word.display}\``,
  );

  if (countdownMsg && countdownMsg.deletable) await countdownMsg.delete().catch(() => {});

  const msg = await channel.send({ embeds: [embed] });

  return new Promise((resolve) => {
    let winnings: number;
    let tax = 0;
    let editing = false;

    const interval = setInterval(() => {
      if (editing) return;
      if (collector.ended) clearInterval(interval);
      if (winners.length === 0) return;
      else if (winners.length === 2) clearInterval(interval);

      embed.setFields({
        name: "winner",
        value: `${winners
          .map(
            (value, index) =>
              `${index === 0 ? "🏅" : "🥈"} ${value.user.toString()} in \`${value.time.toFixed(2)}s\`${
                index === 0 && winnings > 0
                  ? ` +$**${winnings.toLocaleString()}**${
                      tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
                    }`
                  : ""
              } `,
          )
          .join("\n")}`,
      });
      embed.setColor(getColor(winners[0].user.id));

      if (
        msg.embeds[0]?.fields[0]?.value.split("\n").length ===
        embed.data.fields[0].value.split("\n").length
      )
        return;

      editing = true;
      msg
        .edit({ embeds: [embed] })
        .then(() => {
          editing = false;
        })
        .catch(() => {
          editing = false;
        });
    }, 750);

    const filter = async (m: Message) => {
      m.content = m.content.replaceAll("’", "'").replaceAll("”", "'").replaceAll("‘", "'");

      const a = m.content.toLowerCase() == word.actual.toLowerCase();
      const b = [challenger.user.id, target.user.id].includes(m.author.id);
      const c = winners[0]?.user != m.author;

      return a && b && c;
    };

    const collector = channel.createMessageCollector({ filter, time: 30000, max: 2 });

    const winners: { user: User; time: number }[] = [];

    const discordStart = msg.createdTimestamp;

    collector.on("collect", async (message) => {
      winners.push({
        user: message.author,
        time: (message.createdTimestamp - discordStart) / 1000,
      });

      inPlaceSort(winners).asc((i) => i.time);

      setTimeout(async () => {
        if (winners[0].user.id === message.author.id) {
          message.react("🏆");
          addProgress(message.author.id, "fast_typer", 1);
          addTaskProgress(message.author.id, "chat_reaction_daily");
          addTaskProgress(message.author.id, "chat_reaction_weekly");

          winnings = wager * 2;
          tax = 0;

          if (winnings > 1_000_000 && !(await isPremium(message.author.id))) {
            tax = await getTax();

            const taxed = Math.floor(winnings * tax);
            await addToNypsiBank(taxed * 0.5);
            winnings -= taxed;
          }

          resolve({ winner: message.author.id, winnings });

          const challengerId = await createGame({
            bet: wager,
            game: "chatreactionduel",
            outcome: `${message.author.username} won in ${winners[0].time.toFixed(2)}s vs ${
              message.author.id === challenger.user.id
                ? target.user.username
                : challenger.user.username
            }\nword: ${word.actual}`,
            userId: challenger.user.id,
            result: message.author.id === challenger.user.id ? "win" : "lose",
            earned: message.author.id === challenger.user.id ? winnings : 0,
          });
          const targetId = await createGame({
            bet: wager,
            game: "chatreactionduel",
            outcome: `${message.author.username} won in ${winners[0].time.toFixed(2)}s vs ${
              message.author.id === target.user.id ? challenger.user.username : target.user.username
            }\nword: ${word.actual}`,
            userId: target.user.id,
            result: message.author.id === target.user.id ? "win" : "lose",
            earned: message.author.id === target.user.id ? winnings : 0,
          });

          gamble(
            challenger.user,
            "chatreactionduel",
            wager,
            message.author.id == challenger.user.id ? "win" : "lose",
            challengerId,
            message.author.id == challenger.user.id ? winnings : null,
          );
          gamble(
            target.user,
            "chatreactionduel",
            wager,
            message.author.id == target.user.id ? "win" : "lose",
            targetId,
            message.author.id == target.user.id ? winnings : null,
          );
        } else {
          message.react("🐌");
        }
      }, 500);
    });

    collector.on("end", async () => {
      if (winners.length === 0) {
        embed.addField("winner", "nobody won... losers.");

        await msg.edit({ embeds: [embed] });
        await addBalance(challenger, wager);
        await addBalance(target, wager);
        resolve(null);
      }
      setTimeout(() => {
        clearInterval(interval);
      }, 750);
    });
  });
}
