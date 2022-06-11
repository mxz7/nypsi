import { CommandInteraction, Message } from "discord.js"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"
import { redditImage } from "../utils/functions/image"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

declare function require(name: string)

const cmd = new Command("duck", "get a random picture of a duck", Categories.ANIMALS).setAliases(["notdick"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    const { images } = require("../utils/imghandler")

    const duckCache = images.get("duck")

    if (!duckCache) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] })
    }

    if (duckCache.size < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] })
    }

    await addCooldown(cmd.name, message.member, 7)

    const duckLinks = Array.from(duckCache.keys())

    const subredditChoice: any = duckLinks[Math.floor(Math.random() * duckLinks.length)]

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

    const subreddit = subredditChoice.split("/")[4]

    const embed = new CustomEmbed(message.member, false)
        .setTitle(title)
        .setHeader("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image)

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
