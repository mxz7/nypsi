import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getLastfmUsername } from "../utils/functions/users/lastfm";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("topartists", "view your top artists", "music").setAliases(["ta"]);

const lengthChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: "1 week", value: "week" },
  { name: "1 month", value: "month" },
  { name: "1 year", value: "year" },
  { name: "all time", value: "all" },
];

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("length")
    .setDescription("length to fetch results from")
    .setChoices(...lengthChoices),
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

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data as InteractionEditReplyOptions);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  let length = "7day";
  let lengthDisplay = "1 week";

  if (args.length > 0) {
    if (args.join(" ").toLowerCase().includes("all")) {
      length = "overall";
      lengthDisplay = "all time";
    } else if (args.join(" ").toLowerCase().includes("year")) {
      length = "12month";
      lengthDisplay = "1 year";
    } else if (args.join(" ").toLowerCase().includes("month")) {
      length = "1month";
      lengthDisplay = "1 month";
    } else if (args.join(" ").toLowerCase().includes("week")) {
      length = "7day";
      lengthDisplay = "1 week";
    } else {
      return send({
        embeds: [
          new ErrorEmbed("invalid length. use one of the following: `all` `year` `month` `week`"),
        ],
      });
    }
  }

  const username = await getLastfmUsername(message.member);

  if (!username) {
    return send({
      embeds: [new ErrorEmbed("you have not set your last.fm username (**/settings me lastfm**)")],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${username}&period=${length}&api_key=${process.env.LASTFM_TOKEN}&format=json`,
  ).then((res) => res.json());

  if (res.error) {
    logger.error(`lastfm error: ${res.error} - ${username}`);
    return send({ embeds: [new ErrorEmbed(`lastfm error: \`${res.error}\``)] });
  }

  const total: number = parseInt(res.topartists["@attr"].total);
  const artists = res.topartists.artist;

  if (!artists || artists.length == 0) {
    return send({ embeds: [new ErrorEmbed("no artist data")] });
  }

  const pages = new Map<number, string[]>();

  let count = 1;

  for (const artist of artists) {
    let pos: string = count.toString();

    if (pos == "1") {
      pos = "🥇";
    } else if (pos == "2") {
      pos = "🥈";
    } else if (pos == "3") {
      pos = "🥉";
    }

    const text = `${pos} [**${artist.name}**](${artist.url}) - **${parseInt(
      artist.playcount,
    ).toLocaleString()}** plays`;
    if (pages.size == 0) {
      pages.set(1, [text]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [text]);
      } else {
        pages.get(pages.size).push(text);
      }
    }

    count++;
  }

  const embed = new CustomEmbed(message.member).setHeader(
    `${username}'s top artists [${lengthDisplay}]`,
    message.author.avatarURL(),
  );

  embed.setDescription(pages.get(1).join("\n"));
  embed.setFooter({ text: `${total.toLocaleString()} total artists | page 1/${pages.size}` });
  // embed.setThumbnail(artists[0].image[1]["#text"])

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  if (pages.size == 0) {
    return send({ embeds: [embed] });
  }

  const msg = await send({ embeds: [embed], components: [row] });

  let currentPage = 1;
  const lastPage = pages.size;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  async function pageManager(): Promise<void> {
    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await edit({ components: [] }, msg);
      });

    if (!reaction) return;

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({
          text: `${total.toLocaleString()} total artists | page ${currentPage}/${pages.size}`,
        });
        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      }
    } else if (reaction == "➡") {
      if (currentPage == lastPage) {
        return pageManager();
      } else {
        currentPage++;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({
          text: `${total.toLocaleString()} total artists | page ${currentPage}/${pages.size}`,
        });
        if (currentPage == lastPage) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      }
    }
  }
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
