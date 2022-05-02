import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { redditImage } from "../utils/utils.js"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { isPremium } from "../utils/premium/utils"

const cooldown = new Map()

const cmd = new Command("duck", "get a random picture of a duck", Categories.ANIMALS).setAliases(["notdick"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const { duckCache } = require("../utils/imghandler")

    if (duckCache.size < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const duckLinks = Array.from(duckCache.keys())

    const subredditChoice = duckLinks[Math.floor(Math.random() * duckLinks.length)]

    const allowed = duckCache.get(subredditChoice)

    const chosen = allowed[Math.floor(Math.random() * allowed.length)]

    const a = await redditImage(chosen, allowed)

    if (a == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find duck image")] })
    }

    const image = a.split("|")[0]
    const title = a.split("|")[1]
    let url = a.split("|")[2]
    const author = a.split("|")[3]

    url = "https://reddit.com" + url

    const subreddit = subredditChoice.split("r/")[1].split(".json")[0]

    const embed = new CustomEmbed(message.member, false)
        .setTitle(title)
        .setHeader("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image)

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
