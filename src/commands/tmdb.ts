import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getMovie, getTv, movieSearch, tvSearch } from "../utils/functions/tmdb";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

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

    const embed = new CustomEmbed(message.member)
      .setTitle(movie.title)
      .setURL(`https://themoviedb.org/movie/${movie.id}`)
      .setThumbnail(`https://image.tmdb.org/t/p/w1280${movie.poster_path}`)
      .setDescription(
        `${movie.tagline ? `*${movie.tagline}*\n\n` : ""}` +
          `> ${movie.overview}\n\n` +
          `**${Math.round(movie.vote_average * 10)}%** user score\n\n` +
          `-# *${movie.release_date}*\n` +
          `-# *${movie.genres.map((i) => i.name).join(", ")}*`,
      );

    return send({ embeds: [embed] });
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

    const embed = new CustomEmbed(message.member)
      .setTitle(tv.name)
      .setURL(`https://themoviedb.org/tv/${tv.id}`)
      .setThumbnail(`https://image.tmdb.org/t/p/w1280${tv.poster_path}`)
      .setDescription(
        `${tv.tagline ? `*${tv.tagline}*\n\n` : ""}` +
          `> ${tv.overview}\n\n` +
          `**${Math.round(tv.vote_average * 10)}%** user score\n\n` +
          `-# *${tv.first_air_date} - ${tv.status === "Ended" ? tv.last_air_date : "ongoing"}*\n` +
          `-# *${tv.genres.map((i) => i.name).join(", ")}*`,
      );

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
