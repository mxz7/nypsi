import { BaseGuildTextChannel, CommandInteraction, Message, ThreadChannel } from "discord.js"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"
import { redditImage } from "../utils/functions/image"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

declare function require(name: string)

const cmd = new Command("feet", "get a random foot image", Categories.NSFW).setAliases(["tootsies", "toes", "feets"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    if (!(message.channel instanceof BaseGuildTextChannel || message.channel.type == "GUILD_PUBLIC_THREAD")) return

    if (message.channel instanceof ThreadChannel) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] })
    }

    if (!message.channel.nsfw) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] })
    }

    const { images } = require("../utils/imghandler")

    const feetCache = images.get("feet")

    if (!feetCache) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] })
    }

    if (feetCache.size <= 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] })
    }

    await addCooldown(cmd.name, message.member, 7)

    const feetLinks = Array.from(feetCache.keys())

    const subredditChoice: any = feetLinks[Math.floor(Math.random() * feetLinks.length)]

    const allowed = feetCache.get(subredditChoice)

    const chosen = allowed[Math.floor(Math.random() * allowed.length)]

    const a = await redditImage(chosen, allowed)

    if (a == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find feet image")] })
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
