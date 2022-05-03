import { CommandInteraction, Message, MessageActionRow, MessageButton } from "discord.js"
import { getPrefix } from "../utils/guilds/utils"
import { isPremium, getTier } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getNameHistory } from "mc-names"
import { cleanString } from "../utils/utils"

const cooldown = new Map()

const cmd = new Command("minecraft", "view information about a minecraft account", Categories.MINECRAFT).setAliases(["mc"])

cmd.slashEnabled = true
cmd.slashData.addStringOption((option) =>
    option.setName("username").setDescription("username to get the name history for").setRequired(true)
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 2
        }
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}minecraft <name/server IP>`)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let username = cleanString(args[0])

    const nameHistory = await getNameHistory(username)

    if (!nameHistory) {
        return await send({ embeds: [new ErrorEmbed("invalid account")] })
    }

    const skin = `https://mc-heads.net/avatar/${nameHistory.uuid}/256`

    username = nameHistory.username

    const names = nameHistory.toPages(7, "`$username` | `$date`")

    const embed = new CustomEmbed(message.member, false, names.get(1).join("\n"))
        .setTitle(username)
        .setURL("https://namemc.com/profile/" + username)
        .setThumbnail(skin)

    if (names.size >= 2) {
        embed.setFooter(`page 1/${names.size}`)
    }

    /**
     * @type {Message}
     */
    let msg

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (names.size >= 2) {
        msg = await send({ embeds: [embed], components: [row] })
    } else {
        return await send({ embeds: [embed] })
    }

    if (names.size >= 2) {
        let currentPage = 1
        const lastPage = names.size

        const filter = (i) => i.user.id == message.author.id

        const edit = async (data, msg) => {
            if (!(message instanceof Message)) {
                await message.editReply(data)
                return await message.fetchReply()
            } else {
                return await msg.edit(data)
            }
        }

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                .then(async (collected) => {
                    await collected.deferUpdate()
                    return collected.customId
                })
                .catch(async () => {
                    await edit({ components: [] }, msg)
                })

            if (!reaction) return

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager()
                } else {
                    currentPage--
                    embed.setDescription(names.get(currentPage).join("\n"))
                    embed.setFooter("page " + currentPage + "/" + lastPage)
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
                    await edit({ embeds: [embed], components: [row] }, msg)
                    return pageManager()
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++
                    embed.setDescription(names.get(currentPage).join("\n"))
                    embed.setFooter("page " + currentPage + "/" + lastPage)
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
                    await edit({ embeds: [embed], components: [row] }, msg)
                    return pageManager()
                }
            }
        }
        return pageManager()
    }
}

cmd.setRun(run)

module.exports = cmd
