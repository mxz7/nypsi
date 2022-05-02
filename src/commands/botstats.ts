import { Message } from "discord.js"
const { getUserCount, getUserCountGuild } = require("../utils/economy/utils.js")
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
const { cpu } = require("node-os-utils")
const { logger } = require("../utils/logger")
const { version } = require("../../package.json")

const cooldown = new Map()

const cmd = new Command("botstats", "view stats for the bot", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 5 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    const { commandsSize, aliasesSize } = require("../utils/commandhandler")
    const { snipe, eSnipe } = require("../nypsi.js")
    const { mentionQueue, deleteQueue } = require("../utils/users/utils")
    const snipedMessages = snipe.size + eSnipe.size
    const uptime = getUptime(message.client.uptime)
    const memUsage = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const cpuUsage = await cpu.usage()
    const {
        bdsmCache,
        thighsCache,
        pornCache,
        assCache,
        birbCache,
        catCache,
        dogCache,
        rabbitCache,
        snekCache,
    } = require("../utils/imghandler")
    let imgCache = 0

    try {
        for (let link of Array.from(bdsmCache.keys())) {
            imgCache = imgCache + bdsmCache.get(link).length
        }
        for (let link of Array.from(assCache.keys())) {
            imgCache = imgCache + assCache.get(link).length
        }
        for (let link of Array.from(thighsCache.keys())) {
            imgCache = imgCache + thighsCache.get(link).length
        }
        for (let link of Array.from(pornCache.keys())) {
            imgCache = imgCache + pornCache.get(link).length
        }
        for (let link of Array.from(birbCache.keys())) {
            imgCache = imgCache + birbCache.get(link).length
        }
        for (let link of Array.from(catCache.keys())) {
            imgCache = imgCache + catCache.get(link).length
        }
        for (let link of Array.from(dogCache.keys())) {
            imgCache = imgCache + dogCache.get(link).length
        }
        for (let link of Array.from(rabbitCache.keys())) {
            imgCache = imgCache + rabbitCache.get(link).length
        }
        for (let link of Array.from(snekCache.keys())) {
            imgCache = imgCache + snekCache.get(link).length
        }
    } catch {
        logger.warn("error counting image cache")
    }

    let memberCount = 0

    const guilds = message.client.guilds.cache
    await guilds.forEach((g) => {
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
        .setTitle("stats")
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
                "**imgs** " +
                imgCache.toLocaleString() +
                "\n**mention queue** " +
                mentionQueue.length.toLocaleString() +
                "\n-- **collections** " +
                collections.toLocaleString() +
                "\n-- **mentions** " +
                mentions.toLocaleString() +
                "\n-- **deletable** " +
                deleteQueue.length.toLocaleString(),
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
