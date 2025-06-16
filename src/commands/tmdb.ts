import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getEpisodes, getMovie, getTv, movieSearch, tvSearch } from "../utils/functions/tmdb";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { fetchCountryData } from "../utils/functions/gtf/countries";
import { MovieDetails, TVDetails, TVSeasonEpisodeDetails } from "../types/tmdb";

const cmd = new Command("tmdb", "get movie or tv show information", "info").setAliases(["imdb"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((movie) =>
    movie
      .setName("movie")
      .setDescription("find a movie")
      .addStringOption((query) =>
        query
          .setName("tmdb-query")
          .setDescription("movie to search for")
          .setRequired(true)
          .setAutocomplete(true)
          .setMinLength(3),
      ),
  )
  .addSubcommand((tv) =>
    tv
      .setName("tv")
      .setDescription("find a tv show")
      .addStringOption((option) =>
        option
          .setName("tmdb-query")
          .setDescription("tv show to search for")
          .setRequired(true)
          .setAutocomplete(true)
          .setMinLength(3),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  if (message instanceof Message) return send({ embeds: [new ErrorEmbed("pls use /tmdb thx")] });

  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

  const url = "https://image.tmdb.org/t/p/w1280";

  const viewOverview = async (data: MovieDetails | TVDetails, msg?: NypsiMessage) => {
    const embed = new CustomEmbed(message.member);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("watch")
        .setLabel("where to watch")
        .setStyle(ButtonStyle.Primary),
    );

    if (data.type == "movie") {
      embed
        .setTitle(data.title)
        .setURL(`https://themoviedb.org/movie/${data.id}`)
        .setThumbnail(`${url}${data.poster_path}`)
        .setDescription(
          `${data.tagline ? `*${data.tagline}*\n\n` : ""}` +
            `> ${data.overview}\n\n` +
            `**${Math.round(data.vote_average * 10)}%** user score\n\n` +
            `-# *${data.release_date}*\n` +
            `-# *${data.genres.map((i) => i.name).join(", ")}*`,
        );
    } else if (data.type == "tv") {
      embed
        .setTitle(data.name)
        .setURL(`https://themoviedb.org/tv/${data.id}`)
        .setThumbnail(`${url}${data.poster_path}`)
        .setDescription(
          `${data.tagline ? `*${data.tagline}*\n\n` : ""}` +
            `> ${data.overview}\n\n` +
            `**${Math.round(data.vote_average * 10)}%** user score\n\n` +
            `**${data.number_of_seasons.toLocaleString()}** seasons\n` +
            `**${data.number_of_episodes.toLocaleString()}** episodes\n\n` +
            `-# *${data.first_air_date} - ${data.status === "Ended" ? data.last_air_date : "ongoing"}*\n` +
            `-# *${data.genres.map((i) => i.name).join(", ")}*`,
        );

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("season")
          .setLabel("view season")
          .setStyle(ButtonStyle.Primary),
      );
    }

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [row] });
    } else {
      msg = (await send({ embeds: [embed], components: [row] })) as NypsiMessage;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (collected.customId !== "season")
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ embeds: [embed], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "season") {
        const res = await numberSelectionModal(
          interaction as ButtonInteraction,
          "select season",
          "enter season number",
          `seasons range from ${(data as TVDetails).seasons[0].season_number} to ${(data as TVDetails).seasons[(data as TVDetails).seasons.length - 1].season_number}`,
        );

        if (res) {
          const value = res.fields.fields.get("number").value;

          if (isNaN(parseInt(value)) && value != "0") {
            await res.reply({
              embeds: [new ErrorEmbed("invalid number")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          if ((data as TVDetails).seasons.find((i) => i.season_number == parseInt(value))) {
            await res.deferUpdate();
            return viewSeason(data as TVDetails, parseInt(value), msg);
          } else {
            await res.reply({
              embeds: [new ErrorEmbed("invalid season")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }
        }
      } else if (res == "watch") {
        return viewWhereToWatch(data, msg);
      }
    };

    return pageManager();
  };

  const viewWhereToWatch = async (data: MovieDetails | TVDetails, msg?: NypsiMessage) => {
    let selectedCountry = "";

    const makeEmbed = () => {
      const provider = data.providers.find((i) => i.countryCode === selectedCountry);

      const embed = new CustomEmbed(message.member);

      if (data.type == "movie") {
        embed
          .setTitle(data.title)
          .setURL(`https://themoviedb.org/movie/${data.id}/watch`)
          .setThumbnail(`${url}${data.poster_path}`);
      } else if (data.type == "tv") {
        embed
          .setTitle(data.name)
          .setURL(`https://themoviedb.org/tv/${data.id}/watch`)
          .setThumbnail(`${url}${data.poster_path}`);
      }

      embed.setDescription(
        selectedCountry
          ? provider
            ? `where to watch in ${getFlagEmoji(selectedCountry)} **${regionNames.of(selectedCountry)}**`
            : `could not find anywhere to watch this in **${regionNames.of(selectedCountry)}** ):`
          : "select a country to see watch options",
      );

      if (provider) {
        if (provider.flatrate)
          embed.addField(
            "available for streaming",
            provider.flatrate.map((i) => i.provider_name).join("\n"),
          );
        if (provider.rent)
          embed.addField("available to rent", provider.rent.map((i) => i.provider_name).join("\n"));
        if (provider.buy)
          embed.addField("available to buy", provider.buy.map((i) => i.provider_name).join("\n"));
      }

      return embed;
    };

    const options = new StringSelectMenuBuilder()
      .setCustomId("country")
      .setPlaceholder("select a country");

    const shownCountries = ["GB", "US", "CA", "DE", "NL", "IN", "AU"];

    for (const country of data.providers) {
      if (!shownCountries.includes(country.countryCode)) continue;
      options.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(regionNames.of(country.countryCode))
          .setValue(country.countryCode)
          .setEmoji(getFlagEmoji(country.countryCode)),
      );
    }

    options.addOptions(new StringSelectMenuOptionBuilder().setLabel("other").setValue("other"));

    const topRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(options);

    const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("back").setLabel("back").setStyle(ButtonStyle.Primary),
    );

    if (msg) {
      msg = await msg.edit({ embeds: [makeEmbed()], components: [topRow, bottomRow] });
    } else {
      msg = (await send({
        embeds: [makeEmbed()],
        components: [topRow, bottomRow],
      })) as NypsiMessage;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (!collected.isStringSelectMenu())
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ embeds: [makeEmbed()], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (interaction.isStringSelectMenu()) {
        if (interaction.values[0] == "other") {
          const res = await countrySelectionModal(interaction);
          if (res) {
            const value = await getCountryCode(res.fields.fields.get("country").value);
            const found = data.providers.find((i) => i.countryCode === value);

            if (found) {
              await res.deferUpdate();
              selectedCountry = found.countryCode;
              await msg.edit({ embeds: [makeEmbed()] });
            } else {
              let errorMessage: string;

              if (value) {
                try {
                  errorMessage = `no data found for ${regionNames.of(value) ?? value}`;
                } catch {
                  errorMessage = `no data found for ${value}`;
                }
              } else {
                errorMessage = `unknown country`;
              }

              await res.reply({
                embeds: [new ErrorEmbed(errorMessage)],
                flags: MessageFlags.Ephemeral,
              });
              await msg.edit({ embeds: [makeEmbed()] });
            }
          }
          return pageManager();
        }

        await interaction.deferUpdate();

        selectedCountry = interaction.values[0];
        await msg.edit({ embeds: [makeEmbed()] });
        return pageManager();
      } else if (res == "back") {
        return viewOverview(data, msg);
      }
    };

    return pageManager();
  };

  const viewSeason = async (data: TVDetails, seasonNumber: number, msg?: NypsiMessage) => {
    const season = data.seasons.find((i) => i.season_number == seasonNumber);

    const embed = new CustomEmbed(message.member)
      .setTitle(`${data.name} - ${season.name}`)
      .setURL(`https://themoviedb.org/tv/${data.id}/season/${seasonNumber}`)
      .setThumbnail(`${url}${season.poster_path}`)
      .setDescription(
        `${season.overview ? `> ${season.overview}` : ""}\n\n` +
          `**${Math.round(season.vote_average * 10)}%** user score\n\n` +
          `**${season.episode_count.toLocaleString()}** episodes\n\n` +
          `-# *aired ${season.air_date}*\n`,
      );

    const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("back").setLabel("back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("select-episode")
        .setLabel("select episode")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("select-season")
        .setLabel("select season")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(data.seasons[0].season_number >= seasonNumber),
      new ButtonBuilder()
        .setCustomId("➡")
        .setLabel("next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(data.seasons[data.seasons.length - 1].season_number <= seasonNumber),
    );

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [bottomRow] });
    } else {
      msg = (await send({
        embeds: [embed],
        components: [bottomRow],
      })) as NypsiMessage;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (!collected.customId.includes("select"))
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ embeds: [embed], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "➡") {
        return viewSeason(data, seasonNumber + 1, msg);
      } else if (res == "⬅") {
        return viewSeason(data, seasonNumber - 1, msg);
      } else if (res == "select-season") {
        const res = await numberSelectionModal(
          interaction as ButtonInteraction,
          "select season",
          "enter season number",
          `seasons range from ${(data as TVDetails).seasons[0].season_number} to ${(data as TVDetails).seasons[(data as TVDetails).seasons.length - 1].season_number}`,
        );

        if (res) {
          const value = res.fields.fields.get("number").value;

          if (!parseInt(value) || isNaN(parseInt(value))) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid number")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          if ((data as TVDetails).seasons.find((i) => i.season_number == parseInt(value))) {
            await res.deferUpdate();
            return viewSeason(data as TVDetails, parseInt(value), msg);
          } else {
            await res.reply({
              embeds: [new ErrorEmbed("invalid season")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }
        }
      } else if (res == "select-episode") {
        const episodes = await getEpisodes(data.id, seasonNumber);

        if (episodes === "unavailable") {
          await interaction.reply({
            embeds: [new ErrorEmbed("we've been temporarily rate limited by tmdb ):")],
            flags: MessageFlags.Ephemeral,
          });
          return pageManager();
        } else if (typeof episodes === "number") {
          await interaction.reply({
            embeds: [new ErrorEmbed(`error: ${episodes}`)],
            flags: MessageFlags.Ephemeral,
          });
          return pageManager();
        }

        const res = await numberSelectionModal(
          interaction as ButtonInteraction,
          "select episode",
          "enter episode number",
          `episodes range from ${episodes[0].episode_number} to ${episodes[episodes.length - 1].episode_number}`,
        );

        if (res) {
          const value = res.fields.fields.get("number").value;

          if (!parseInt(value) || isNaN(parseInt(value))) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid number")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          if (episodes.find((i) => i.episode_number == parseInt(value))) {
            await res.deferUpdate();
            return viewEpisode(data, episodes, seasonNumber, parseInt(value), msg);
          } else {
            await res.reply({
              embeds: [new ErrorEmbed("invalid episode")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }
        }
      } else if (res == "back") {
        return viewOverview(data, msg);
      }
    };

    return pageManager();
  };

  const viewEpisode = async (
    data: TVDetails,
    episodes: TVSeasonEpisodeDetails[],
    seasonNumber: number,
    episodeNumber: number,
    msg?: NypsiMessage,
  ) => {
    const episode = episodes.find((i) => i.episode_number == episodeNumber);

    const embed = new CustomEmbed(message.member)
      .setTitle(`Episode ${episode.episode_number} - ${episode.name}`)
      .setURL(
        `https://themoviedb.org/tv/${data.id}/season/${seasonNumber}/episode/${episodeNumber}`,
      )
      .setThumbnail(`${url}${episode.still_path}`)
      .setDescription(
        `${episode.overview ? `> ${episode.overview}` : ""}\n\n` +
          `**${Math.round(episode.vote_average * 10)}%** user score\n\n` +
          `-# duration: ${formatDuration(episode.runtime)}\n` +
          `-# *aired ${episode.air_date}*\n`,
      );

    const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("back").setLabel("back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("select")
        .setLabel("select episode")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(episodes[0].episode_number >= episodeNumber),
      new ButtonBuilder()
        .setCustomId("➡")
        .setLabel("next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(episodes[episodes.length - 1].episode_number <= episodeNumber),
    );

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [bottomRow] });
    } else {
      msg = (await send({
        embeds: [embed],
        components: [bottomRow],
      })) as NypsiMessage;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (collected.customId !== "select")
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ embeds: [embed], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "➡") {
        return viewEpisode(data, episodes, seasonNumber, episodeNumber + 1, msg);
      } else if (res == "⬅") {
        return viewEpisode(data, episodes, seasonNumber, episodeNumber - 1, msg);
      } else if (res == "select") {
        const res = await numberSelectionModal(
          interaction as ButtonInteraction,
          "select episode",
          "enter episode number",
          `episodes range from ${episodes[0].episode_number} to ${episodes[episodes.length - 1].episode_number}`,
        );

        if (res) {
          const value = res.fields.fields.get("number").value;

          if (isNaN(parseInt(value)) && value != "0") {
            await res.reply({
              embeds: [new ErrorEmbed("invalid number")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          if (episodes.find((i) => i.episode_number == parseInt(value))) {
            await res.deferUpdate();
            return viewEpisode(data, episodes, seasonNumber, parseInt(value), msg);
          } else {
            await res.reply({
              embeds: [new ErrorEmbed("invalid episode")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }
        }
      } else if (res == "back") {
        return viewSeason(data, seasonNumber, msg);
      }
    };

    return pageManager();
  };

  if (args[0].toLowerCase() === "movie") {
    args.shift();
    const query = args.join(" ");

    let movie: Awaited<ReturnType<typeof getMovie>>;

    if (!isNaN(parseInt(query))) {
      movie = await getMovie(query);
    } else {
      const search = await movieSearch(query);

      if (search === "unavailable") {
        return send({
          embeds: [new ErrorEmbed("we've been temporarily rate limited by tmdb ):")],
          flags: MessageFlags.Ephemeral,
        });
      } else if (typeof search === "number") {
        if (search === 404) {
          return send({
            embeds: [new ErrorEmbed("movie not found")],
            flags: MessageFlags.Ephemeral,
          });
        }

        return send({
          embeds: [new ErrorEmbed(`error: ${search}`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!search.results[0]) {
        return send({
          embeds: [new ErrorEmbed("movie not found")],
          flags: MessageFlags.Ephemeral,
        });
      }

      movie = await getMovie(search.results[0].id.toString());
    }

    if (movie === "unavailable")
      return send({
        embeds: [new ErrorEmbed("we've been temporarily rate limited by tmdb ):")],
        flags: MessageFlags.Ephemeral,
      });

    if (typeof movie === "number") {
      if (movie === 404) {
        return send({
          embeds: [new ErrorEmbed("movie not found")],
          flags: MessageFlags.Ephemeral,
        });
      }

      return send({ embeds: [new ErrorEmbed(`error: ${movie}`)], flags: MessageFlags.Ephemeral });
    }

    return viewOverview(movie);
  } else if (args[0].toLowerCase() === "tv") {
    args.shift();
    const query = args.join(" ");

    let tv: Awaited<ReturnType<typeof getTv>>;

    if (!isNaN(parseInt(query))) {
      tv = await getTv(query);
    } else {
      const search = await tvSearch(query);

      if (search === "unavailable") {
        return send({
          embeds: [new ErrorEmbed("we've been temporarily rate limited by tmdb ):")],
          flags: MessageFlags.Ephemeral,
        });
      } else if (typeof search === "number") {
        if (search === 404) {
          return send({
            embeds: [new ErrorEmbed("tv show not found")],
            flags: MessageFlags.Ephemeral,
          });
        }

        return send({
          embeds: [new ErrorEmbed(`error: ${search}`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!search.results[0]) {
        return send({
          embeds: [new ErrorEmbed("tv show not found")],
          flags: MessageFlags.Ephemeral,
        });
      }

      tv = await getTv(search.results[0].id.toString());
    }

    if (tv === "unavailable")
      return send({
        embeds: [new ErrorEmbed("we've been temporarily rate limited by tmdb ):")],
        flags: MessageFlags.Ephemeral,
      });

    if (typeof tv === "number") {
      if (tv === 404) {
        return send({
          embeds: [new ErrorEmbed("tv show not found")],
          flags: MessageFlags.Ephemeral,
        });
      }

      return send({ embeds: [new ErrorEmbed(`error: ${tv}`)], flags: MessageFlags.Ephemeral });
    }

    return viewOverview(tv);
  }

  async function countrySelectionModal(interaction: StringSelectMenuInteraction) {
    const id = `tmdb-country-select-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle("enter country");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("country")
          .setLabel("enter country name or code")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25),
      ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == interaction.user.id && i.customId === id;

    return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
  }

  async function numberSelectionModal(
    interaction: ButtonInteraction,
    title: string,
    label: string,
    placeholder: string,
  ) {
    const id = `tmdb-number-select-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle(title);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("number")
          .setLabel(label)
          .setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(3),
      ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == interaction.user.id && i.customId === id;

    return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
  }
}

async function getCountryCode(name: string): Promise<string | undefined> {
  const res = await fetchCountryData(name);
  return res == "failed" ? undefined : res.cca2;
}

function getFlagEmoji(countryCode: string) {
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 0x1f1e6 + char.charCodeAt(0) - "A".charCodeAt(0),
  );

  return String.fromCodePoint(...codePoints);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours ? `${hours}h ` : ""}${remainingMinutes}m`;
}

cmd.setRun(run);

module.exports = cmd;
