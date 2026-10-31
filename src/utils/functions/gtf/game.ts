import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Interaction,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";
import { nanoid } from "nanoid";
import { countries } from "../../../../data/lists.json";
import { NypsiCommandInteraction, NypsiMessage } from "../../../models/Command";
import { CustomEmbed, ErrorEmbed, getColor } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { addCooldown } from "../../handlers/cooldownhandler";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { compareTwoStrings, escapeFormattingCharacters, formatTime } from "../string";
import { fetchCountryData } from "./countries";
import { saveGameStats } from "./stats";

export async function startGTFGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  secondPlayer?: User,
  requestMessage?: Message,
  replayInteraction?: MessageComponentInteraction,
) {
  const id = countries[Math.floor(Math.random() * countries.length)];

  const country = await fetchCountryData(id);

  if (country == "failed") {
    if (message instanceof Message)
      return message.channel.send({
        embeds: [new ErrorEmbed(`failed to fetch a valid country`)],
      });
    else
      return message
        .reply({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] })
        .catch(() =>
          message.channel.send({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] }),
        );
  }

  const embed = new CustomEmbed(message.member, "guess the country of the flag below")
    .setHeader(`${message.author.username}'s guess the flag game`, message.author.avatarURL())
    .setImage(country.flags.png);

  logger.info(
    `gtf: starting game with country ${country.name.common} (${country.cca2}) for ${message.author.id} embed image: ${embed.data.image?.url}`,
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("guess")
      .setCustomId("btn-guess-the-flag")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel("hint")
      .setCustomId("btn-show-flag-hint")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel("end")
      .setCustomId("btn-end-guess-the-flag")
      .setStyle(ButtonStyle.Danger),
  );

  if (secondPlayer) {
    row.components.splice(1, 2);

    embed.setDescription(
      "guess the country of the flag below\n\n" +
        `${escapeFormattingCharacters(message.author.username)} vs ${secondPlayer.username.replaceAll("_", "\\_")}`,
    );
    embed.setHeader("guess the flag");
  }

  let msg: Message;
  let winner: User;
  let winnerStats: ReturnType<typeof saveGameStats>;
  const guesses: string[] = [];

  if (replayInteraction) {
    msg = await replayInteraction
      .update({ embeds: [embed], components: [row] })
      .then((m) => m.fetch())
      .catch(
        () =>
          replayInteraction.message.edit({
            embeds: [embed],
            components: [row],
          }) as Promise<Message>,
      );
  } else if (requestMessage) {
    msg = await requestMessage.reply({ embeds: [embed], components: [row] });
  } else {
    if (message instanceof Message) {
      msg = await message.channel.send({ embeds: [embed], components: [row] });
    } else {
      msg = await message
        .reply({ embeds: [embed], components: [row] })
        .then((m) => m.fetch())
        .catch(() =>
          message.editReply({ embeds: [embed], components: [row] }).then((m) => m.fetch()),
        );
    }
  }

  const startedAt = replayInteraction ? (msg.editedTimestamp ?? Date.now()) : msg.createdTimestamp;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) =>
      secondPlayer
        ? i.user.id === message.author.id || i.user.id === secondPlayer?.id
        : i.user.id === message.author.id,
    time: 300000,
  });

  const isCorrectGuess = (guess: string) => {
    const normalized = guess.trim().toLowerCase();

    return (
      normalized === country.cca2.toLowerCase() ||
      [country.name.common, country.name.official, ...country.altSpellings].some(
        (name) => compareTwoStrings(normalized, name.toLowerCase()) > 0.9,
      )
    );
  };

  const completeGame = (user: User, createdTimestamp: number) => {
    winner = user;
    const completionTime = createdTimestamp - startedAt;
    const winnerGuesses = secondPlayer
      ? guesses.filter((guess) => guess.startsWith(winner.username + ":"))
      : guesses;

    winnerStats = saveGameStats(winner.id, id, winnerGuesses, true, completionTime);
    collector.stop("win");
    if (secondPlayer) {
      const loser = winner.id === message.author.id ? secondPlayer : message.author;
      saveGameStats(
        loser.id,
        id,
        guesses.filter((guess) => guess.startsWith(loser.username + ":")),
        false,
      );
    }

    return completionTime;
  };

  const messageCollector =
    "createMessageCollector" in msg.channel
      ? msg.channel.createMessageCollector({
          filter: (guess) =>
            !collector.ended &&
            !guess.author.bot &&
            (guess.author.id === message.author.id || guess.author.id === secondPlayer?.id) &&
            isCorrectGuess(guess.content),
          time: 300000,
        })
      : undefined;

  messageCollector?.on("collect", (guess) => {
    if (collector.ended) return;

    const answer = guess.content.trim();
    guesses.push(secondPlayer ? `${guess.author.username}: ${answer}` : answer);
    completeGame(guess.author, guess.createdTimestamp);

    guess.react("✅").catch(() => {});
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "btn-end-guess-the-flag") {
      return collector.stop("cancelled");
    } else if (interaction.customId === "btn-show-flag-hint") {
      row.components.splice(1, 1);
      await interaction.update({ embeds: [embed], components: [row] });
      await interaction.followUp({
        embeds: [
          new CustomEmbed(message.member, `this country is in **${country.continents[0]}**`),
        ],
      });
      return;
    }

    const id = `modal-guess-flag-${nanoid()}`;

    const modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle("guess the flag")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("your guess")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("guess")
              .setRequired(true)
              .setStyle(TextInputStyle.Short),
          ),
      );

    await interaction.showModal(modal);

    const res = await interaction
      .awaitModalSubmit({
        time: 300000,
        filter: (i) => i.user.id === interaction.user.id && i.customId === id,
      })
      .catch(() => {});

    if (!res) return;
    if (!res.isModalSubmit()) return;

    if (collector.ended)
      return res
        .reply({
          embeds: [new ErrorEmbed("this game has ended")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});

    const guess = res.fields.getTextInputValue("guess").trim();

    if (
      secondPlayer
        ? guesses.find(
            (i) => i.toLowerCase() === `${interaction.user.username}: ${guess.toLowerCase()}`,
          )
        : guesses.find((i) => i.toLowerCase() === guess.toLowerCase())
    )
      return res
        .reply({
          embeds: [new ErrorEmbed("you have already guessed this")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});

    guesses.push(secondPlayer ? `${interaction.user.username}: ${guess}` : guess);

    if (isCorrectGuess(guess)) {
      const completionTime = completeGame(res.user, res.createdTimestamp);
      await res
        .reply({
          embeds: [
            new CustomEmbed(
              undefined,
              `correct! you won in \`${MStoTime(completionTime)}\``,
            ).setColor(Constants.EMBED_SUCCESS_COLOR),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    } else {
      embed.setFields({ name: "guesses", value: guesses.map((i) => `\`${i}\``).join("\n") });

      res
        .reply({
          embeds: [new ErrorEmbed(`\`${guess}\` is not the country`)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      msg.edit({ embeds: [embed], components: [row] });
    }
  });

  collector.on("end", async (collected, reason) => {
    messageCollector?.stop();
    row.components.forEach((c) => c.setDisabled(true));

    if (guesses.length > 0)
      embed.setFields({ name: "guesses", value: guesses.map((i) => `\`${i}\``).join("\n") });

    const stats = winnerStats ? await winnerStats : undefined;

    if (reason === "cancelled") {
      saveGameStats(message.author.id, id, guesses, false);
      if (secondPlayer) saveGameStats(secondPlayer.id, id, guesses, false);
      embed
        .setDescription("**game cancelled**\n\n" + `the country was: **${country.name.common}**`)
        .setColor(Constants.EMBED_FAIL_COLOR);
    } else if (reason === "time") {
      saveGameStats(message.author.id, id, guesses, false);
      if (secondPlayer) saveGameStats(secondPlayer.id, id, guesses, false);
      embed
        .setDescription("**out of time**\n\n" + `the country was: **${country.name.common}**`)
        .setColor(Constants.EMBED_FAIL_COLOR);
    } else {
      if (secondPlayer) {
        embed
          .setDescription(
            `**${winner.username.replaceAll("_", "\\_")}** won! the country was: **${country.name.common}**\n\n` +
              `population: **${country.population.toLocaleString()}**\n` +
              `official name: **${country.name.official}**`,
          )
          .setColor(getColor(winner.id));
      } else {
        embed
          .setDescription(
            `you won! the country was: **${country.name.common}**\n\n` +
              `population: **${country.population.toLocaleString()}**\n` +
              `official name: **${country.name.official}**`,
          )
          .setColor(Constants.EMBED_SUCCESS_COLOR);
      }

      embed.setDescription(
        `${embed.data.description}\n\nwins: **${stats.wins.toLocaleString()}** (#${stats.winPosition.toLocaleString()})`,
      );
      embed.setFooter({ text: `${formatTime(stats.time)}` });
    }

    const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [row];

    if (!secondPlayer) {
      components.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("btn-play-guess-the-flag-again")
            .setLabel("play again")
            .setStyle(ButtonStyle.Success),
        ),
      );
    }

    if (reason === "cancelled") await collected.last().update({ embeds: [embed], components });
    else await msg.edit({ embeds: [embed], components });

    if (stats?.newFastest) {
      await msg.reply({
        embeds: [
          new CustomEmbed(
            winner.id,
            `${secondPlayer ? `**${escapeFormattingCharacters(winner.username)}**'s new personal best` : "new personal best"}: \`${formatTime(stats.time)}\` (#${stats.timePosition.toLocaleString()})`,
          ).setHeader("new personal best", winner.avatarURL()),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (!secondPlayer) await playAgain(msg, message);
  });
}

async function playAgain(
  msg: Message,
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
) {
  const res = await msg
    .awaitMessageComponent({
      filter: (i: Interaction) => i.user.id === message.author.id,
      time: 30000,
      componentType: ComponentType.Button,
    })
    .catch(() => {
      msg.edit({ components: [] }).catch(() => {});
      return;
    });

  if (!res || res.customId !== "btn-play-guess-the-flag-again") return;

  await addCooldown("guesstheflag", message.member, 5);

  setTimeout(() => {
    res.deferUpdate().catch(() => {});
  }, 2000);

  await startGTFGame(message, undefined, undefined, res);
}
