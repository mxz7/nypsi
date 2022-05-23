import { CommandInteraction, Message, MessageActionRow, MessageButton } from "discord.js"
import fetch from "node-fetch"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import { getLastfmUsername } from "../utils/users/utils"
import { getPrefix } from "../utils/guilds/utils"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"
import { logger } from "../utils/logger"

const cmd = new Command("toptracks", "view your top tracks", Categories.MUSIC).setAliases(["tt"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    let length = "7day"
    let lengthDisplay = "1 week"

    if (args.length > 0) {
        if (args.join(" ").toLowerCase().includes("all")) {
            length = "overall"
            lengthDisplay = "all time"
        } else if (args.join(" ").toLowerCase().includes("year")) {
            length = "12month"
            lengthDisplay = "1 year"
        } else if (args.join(" ").toLowerCase().includes("month")) {
            length = "1month"
            lengthDisplay = "1 month"
        } else if (args.join(" ").toLowerCase().includes("week")) {
            length = "7day"
            lengthDisplay = "1 week"
        } else {
            return message.channel.send({
                embeds: [new ErrorEmbed("invalid length. use one of the following: `all` `year` `month` `week`")],
            })
        }
    }

    let username: any = getLastfmUsername(message.member)

    if (!username) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`you have not set your last.fm username (${getPrefix(message.guild)}**slfm**)`)],
        })
    }

    await addCooldown(cmd.name, message.member, 10)

    username = username.username

    const res = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${username}&period=${length}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json())

    if (res.error) {
        logger.error(`lastfm error: ${res.error} - ${username}`)
        return message.channel.send({ embeds: [new ErrorEmbed(`lastfm error: \`${res.error}\``)] })
    }

    const total: number = parseInt(res.toptracks["@attr"].total)
    const tracks: Track[] = res.toptracks.track

    if (!tracks || tracks.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("no track data")] })
    }

    const pages: Map<number, string[]> = new Map()

    let count = 1

    for (const track of tracks) {
        let pos: string = count.toString()

        if (pos == "1") {
            pos = "🥇"
        } else if (pos == "2") {
            pos = "🥈"
        } else if (pos == "3") {
            pos = "🥉"
        }

        const text = `${pos} [**${track.name} - ${track.artist.name}**](${track.url}) - **${parseInt(
            track.playcount
        ).toLocaleString()}** plays`
        if (pages.size == 0) {
            pages.set(1, [text])
        } else {
            if (pages.get(pages.size).length >= 10) {
                pages.set(pages.size + 1, [text])
            } else {
                pages.get(pages.size).push(text)
            }
        }

        count++
    }

    const embed = new CustomEmbed(message.member, false).setHeader(
        `${username}'s top tracks [${lengthDisplay}]`,
        message.author.avatarURL()
    )

    embed.setDescription(pages.get(1).join("\n"))
    embed.setFooter(`${total.toLocaleString()} total plays | page 1/${pages.size}`)

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (pages.size == 0) {
        return message.channel.send({ embeds: [embed] })
    }

    const msg = await message.channel.send({ embeds: [embed], components: [row] })

    let currentPage = 1
    const lastPage = pages.size

    const filter = (i) => i.user.id == message.author.id

    async function pageManager() {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000 })
            .then(async (collected) => {
                await collected.deferUpdate()
                return collected.customId
            })
            .catch(async () => {
                await msg.edit({ components: [] })
            })

        if (!reaction) return

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`${total.toLocaleString()} total plays | page ${currentPage}/${pages.size}`)
                if (currentPage == 1) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage == lastPage) {
                return pageManager()
            } else {
                currentPage++
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`${total.toLocaleString()} total plays | page ${currentPage}/${pages.size}`)
                if (currentPage == lastPage) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        }
    }
    return pageManager()
}

cmd.setRun(run)

module.exports = cmd

interface Track {
    name: string
    artist: {
        url: string
        name: string
    }
    url: string
    playcount: string
}
