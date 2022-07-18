import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    Interaction,
} from "discord.js";
import fetch from "node-fetch";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getLastfmUsername } from "../utils/users/utils";
import { getPrefix } from "../utils/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("topartists", "view your top artists", Categories.MUSIC).setAliases(["ta"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
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
            return message.channel.send({
                embeds: [new ErrorEmbed("invalid length. use one of the following: `all` `year` `month` `week`")],
            });
        }
    }

    const username = await getLastfmUsername(message.member);

    if (!username) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`you have not set your last.fm username (${await getPrefix(message.guild)}**slfm**)`)],
        });
    }

    await addCooldown(cmd.name, message.member, 10);

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${username}&period=${length}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json());

    if (res.error) {
        logger.error(`lastfm error: ${res.error} - ${username}`);
        return message.channel.send({ embeds: [new ErrorEmbed(`lastfm error: \`${res.error}\``)] });
    }

    const total: number = parseInt(res.topartists["@attr"].total);
    const artists = res.topartists.artist;

    if (!artists || artists.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("no artist data")] });
    }

    const pages: Map<number, string[]> = new Map();

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

        const text = `${pos} [**${artist.name}**](${artist.url}) - **${parseInt(artist.playcount).toLocaleString()}** plays`;
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
        message.author.avatarURL()
    );

    embed.setDescription(pages.get(1).join("\n"));
    embed.setFooter({ text: `${total.toLocaleString()} total artists | page 1/${pages.size}` });
    // embed.setThumbnail(artists[0].image[1]["#text"])

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (pages.size == 0) {
        return message.channel.send({ embeds: [embed] });
    }

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

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
                await msg.edit({ components: [] });
            });

        if (!reaction) return;

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager();
            } else {
                currentPage--;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: `${total.toLocaleString()} total artists | page ${currentPage}/${pages.size}` });
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
                            .setDisabled(false)
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
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        } else if (reaction == "➡") {
            if (currentPage == lastPage) {
                return pageManager();
            } else {
                currentPage++;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: `${total.toLocaleString()} total artists | page ${currentPage}/${pages.size}` });
                if (currentPage == lastPage) {
                    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId("⬅")
                            .setLabel("back")
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(false),
                        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
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
                            .setDisabled(false)
                    );
                }
                await msg.edit({ embeds: [embed], components: [row] });
                return pageManager();
            }
        }
    }
    return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
