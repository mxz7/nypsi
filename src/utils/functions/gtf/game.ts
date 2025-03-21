import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";
import { nanoid } from "nanoid";
import { compareTwoStrings } from "string-similarity";
import { NypsiCommandInteraction, NypsiMessage } from "../../../models/Command";
import { CustomEmbed, ErrorEmbed, getColor } from "../../../models/EmbedBuilders";
// @ts-expect-error doesnt like getting from json file
import { countries } from "../../../../data/lists.json";
import prisma from "../../../init/database";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";

interface CountryData {
  name: {
    common: string;
    official: string;
  };
  altSpellings: string[];
  population: number;
  flags: {
    png: string;
  };
  continents: string[];
}

export async function startGTFGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  secondPlayer?: User,
  requestMessage?: Message,
) {
  const id = countries[Math.floor(Math.random() * countries.length)];

  const res: Response | { ok: false } = await fetch(
    `https://restcountries.com/v3.1/alpha/${id.toLowerCase()}`,
  ).catch(() => ({
    ok: false,
  }));

  if (!res.ok) {
    logger.error(`failed to fetch valid country (${id})`, res);
    if (message instanceof Message)
      return message.channel.send({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] });
    else
      return message
        .reply({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] })
        .catch(() =>
          message.channel.send({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] }),
        );
  }

  const country: CountryData = await res.json().then((r) => r[0]);

  const embed = new CustomEmbed(message.member, "guess the country of the flag below")
    .setHeader(`${message.author.username}'s guess the flag game`, message.author.avatarURL())
    .setImage(country.flags.png);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setLabel("guess").setCustomId("gtf-guess").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setLabel("hint").setCustomId("gtf-hint").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("end").setCustomId("gtf-end").setStyle(ButtonStyle.Danger),
  );

  if (secondPlayer) {
    row.components.splice(1, 2);

    embed.setDescription(
      "guess the country of the flag below\n\n" +
        `${message.author.username} vs ${secondPlayer.username}`,
    );
    embed.setHeader("guess the flag");
  }

  let msg: Message;
  let winner: User;
  const guesses: string[] = [];

  if (requestMessage) {
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

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) =>
      secondPlayer
        ? i.user.id === message.author.id || i.user.id === secondPlayer.id
        : i.user.id === message.author.id,
    time: 300000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "gtf-end") {
      return collector.stop("cancelled");
    } else if (interaction.customId === "gtf-hint") {
      row.components.splice(1, 1);
      await interaction.update({ embeds: [embed], components: [row] });
      await interaction.followUp({
        embeds: [
          new CustomEmbed(message.member, `this country is in **${country.continents[0]}**`),
        ],
      });
      return;
    }

    const id = `gtf-guess-${nanoid()}`;

    const modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle("guess the flag")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("guess")
            .setLabel("your guess")
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

    const guess = res.fields.fields.first().value;

    if (
      secondPlayer
        ? guesses.find(
            (i) => i.toLowerCase() === `${interaction.user.username}: guess.toLowerCase()`,
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

    let correct = false;

    if (compareTwoStrings(guess.toLowerCase(), country.name.common.toLowerCase()) > 0.9) {
      correct = true;
    } else if (compareTwoStrings(guess.toLowerCase(), country.name.official.toLowerCase()) > 0.9) {
      correct = true;
    } else {
      for (const spelling of country.altSpellings) {
        if (compareTwoStrings(guess.toLowerCase(), spelling.toLowerCase()) > 0.9) {
          correct = true;
          break;
        }
      }
    }

    if (collector.ended)
      return res
        .reply({
          embeds: [new ErrorEmbed("this game has ended")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});

    if (correct) {
      winner = res.user;
      collector.stop("win");
      await res
        .reply({
          embeds: [
            new CustomEmbed(
              undefined,
              `correct! you won in \`${MStoTime(res.createdTimestamp - msg.createdTimestamp)}\``,
            ).setColor(Constants.EMBED_SUCCESS_COLOR),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      saveGameStats(
        res.user.id,
        id,
        guesses.filter((i) => i.startsWith(res.user.username + ":")),
        true,
        res.createdTimestamp - msg.createdTimestamp,
      );
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
    row.components.forEach((c) => c.setDisabled(true));

    if (guesses.length > 0)
      embed.setFields({ name: "guesses", value: guesses.map((i) => `\`${i}\``).join("\n") });

    if (reason === "cancelled") {
      saveGameStats(message.author.id, id, guesses, false);
      embed
        .setDescription("**game cancelled**\n\n" + `the country was: **${country.name.common}**`)
        .setColor(Constants.EMBED_FAIL_COLOR);
    } else if (reason === "time") {
      saveGameStats(message.author.id, id, guesses, false);
      embed
        .setDescription("**out of time**\n\n" + `the country was: **${country.name.common}**`)
        .setColor(Constants.EMBED_FAIL_COLOR);
    } else {
      if (secondPlayer) {
        embed
          .setDescription(
            `**${winner.username}** won! the country was: **${country.name.common}**\n\n` +
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
    }

    if (reason === "cancelled")
      await collected.last().update({ embeds: [embed], components: [row] });
    else await msg.edit({ embeds: [embed], components: [row] });
  });
}

async function saveGameStats(
  userId: string,
  countryId: string,
  guesses: string[],
  won: boolean,
  time?: number,
) {
  if (won) {
    addProgress(userId, "flag", 1);
    addTaskProgress(userId, "flag_daily");
    addTaskProgress(userId, "flag_weekly");
  }
  await prisma.flagGame.create({
    data: {
      time,
      won,
      userId,
      country: countryId,
      guesses,
    },
  });
}
