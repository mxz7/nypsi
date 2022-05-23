import { CommandInteraction, Message } from "discord.js"
import { getUserCount, getUserCountGuild } from "../utils/economy/utils.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { cpu } from "node-os-utils"
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../package.json"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js"
import { workerCount } from "../events/message.js"
import { deleteQueue, mentionQueue } from "../utils/users/utils.js"

declare function require(name: string)

const cmd = new Command("botstats", "view stats for the bot", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (message.author.id != "672793821850894347") return
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    await addCooldown(cmd.name, message.member, 5)

    const { commandsSize, aliasesSize } = require("../utils/commandhandler")
    const { snipe, eSnipe } = require("../nypsi.js")
    // const { mentionQueue, deleteQueue } = require("../utils/users/utils")
    const snipedMessages = snipe.size + eSnipe.size
    const uptime = getUptime(message.client.uptime)
    const memUsage = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const cpuUsage = await cpu.usage()

    let memberCount = 0

    const guilds = message.client.guilds.cache
    guilds.forEach((g) => {
        memberCount = memberCount + g.memberCount
    })

    let collections = 0
    let mentions = 0

    for (const mention of mentionQueue) {
        if (mention.type == "collection") {
            collections++
        } else if (mention.type == "mention") {
            mentions++
        }
    }

    const embed = new CustomEmbed(message.member)
        .setHeader("nypsi stats")
        .addField(
            "bot",
            "**server count** " +
                guilds.size.toLocaleString() +
                "\n" +
                "**user count** " +
                memberCount.toLocaleString() +
                "\n" +
                "**total commands** " +
                commandsSize +
                "\n" +
                "**total aliases** " +
                aliasesSize +
                "\n" +
                "**uptime** " +
                uptime,
            true
        )
        .addField(
            "economy",
            `**users** ${getUserCount().toLocaleString()}
         -- **this server** ${getUserCountGuild(message.guild).toLocaleString()}`,
            true
        )
        .addField(
            "cache",
            "**snipe** " +
                snipedMessages.toLocaleString() +
                "\n" +
                "\n**mention queue** " +
                mentionQueue.length.toLocaleString() +
                "\n-- **collections** " +
                collections.toLocaleString() +
                "\n-- **mentions** " +
                mentions.toLocaleString() +
                "\n-- **deletable** " +
                deleteQueue.length.toLocaleString() +
                "\n-- **workers** " +
                workerCount.toLocaleString(),
            true
        )
        .addField("usage", `**memory** ${memUsage}mb\n**cpu** ${cpuUsage}%`, true)

    embed.setFooter(`v${version}`)

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd

function getUptime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor(daysms / (60 * 60 * 1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor(hoursms / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor(minutesms / 1000)

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}
