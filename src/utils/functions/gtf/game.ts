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
} from "discord.js";
import { compareTwoStrings } from "string-similarity";
import { NypsiCommandInteraction, NypsiMessage } from "../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
// @ts-expect-error doesnt like getting from json file
import { countries } from "../../../../data/lists.json";
import prisma from "../../../init/database";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { addProgress } from "../economy/achievements";

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
) {
  const id = countries[Math.floor(Math.random() * countries.length)];

  const res = await fetch(`https://restcountries.com/v3.1/alpha/${id.toLowerCase()}`);

  if (!res.ok) {
    logger.error(`failed to fetch valid country (${id})`, res);
    if (message instanceof Message)
      return message.channel.send({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] });
    else return message.reply({ embeds: [new ErrorEmbed(`failed to fetch a valid country`)] });
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

  let msg: Message;
  const guesses: string[] = [];

  if (message instanceof Message) {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  } else {
    msg = await message.reply({ embeds: [embed], components: [row] }).then((m) => m.fetch());
  }

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === message.author.id,
    time: 300000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "gtf-end") {
      collector.stop("cancelled");
    }
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "gtf-end") {
      return collector.stop("cancelled");
    } else if (interaction.customId === "gtf-hint") {
      row.components.splice(1, 1);
      msg.edit({ embeds: [embed], components: [row] });
      await interaction.reply({
        embeds: [
          new CustomEmbed(message.member, `this country is in **${country.continents[0]}**`),
        ],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("gtf-guess")
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
      .awaitModalSubmit({ time: 300000, filter: (i) => i.user.id === message.author.id })
      .catch(() => {});

    if (!res) return;
    if (!res.isModalSubmit()) return;

    const guess = res.fields.fields.first().value;

    if (guesses.find((i) => i.toLowerCase() === guess.toLowerCase()))
      return res
        .reply({
          embeds: [new ErrorEmbed("you have already guessed this")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});

    guesses.push(guess);

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
      return res.reply({
        embeds: [new ErrorEmbed("this game has ended")],
        flags: MessageFlags.Ephemeral,
      });

    if (correct) {
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
      collector.stop("win");
      saveGameStats(
        message.author.id,
        id,
        guesses,
        true,
        res.createdTimestamp - msg.createdTimestamp,
      );
      addProgress(message.author.id, "flag", 1);
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
      embed
        .setDescription(
          `you won! the country was: **${country.name.common}**\n\n` +
            `population: **${country.population.toLocaleString()}**\n` +
            `official name: **${country.name.official}**`,
        )
        .setColor(Constants.EMBED_SUCCESS_COLOR);
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
