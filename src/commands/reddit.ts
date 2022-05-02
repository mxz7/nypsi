import { Message } from "discord.js"
import { redditImage } from "../utils/utils.js"
const fetch = require("node-fetch")
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
import { isPremium } from "../utils/premium/utils"

const cooldown = new Map()

const blacklisted = ["body", "shit"]

const cmd = new Command("reddit", "get a random image from any subreddit", Categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}reddit <subreddit>`)] })
    }

    for (let bannedSubReddit of blacklisted) {
        if (args[0].toLowerCase() == bannedSubReddit && !message.channel.nsfw) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "this subreddit is known for nsfw content without using nsfw flairs, please use an nsfw channel"
                    ),
                ],
            })
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let allowed

    try {
        const res = await fetch("https://www.reddit.com/r/" + args[0] + ".json?limit=100").then((a) => a.json())

        allowed = res.data.children.filter((post) => !post.data.is_self)
    } catch (e) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid subreddit")] })
    }

    const chosen = allowed[Math.floor(Math.random() * allowed.length)]

    if (!chosen) {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find image")] })
    }

    if (chosen.data.over_18 && !message.channel.nsfw) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] })
    }

    const a = await redditImage(chosen, allowed)

    const image = a.split("|")[0]
    const title = a.split("|")[1]
    let url = a.split("|")[2]
    const author = a.split("|")[3]

    url = "https://reddit.com" + url

    if (image == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find image")] })
    }

    const subreddit = args[0]

    const embed = new CustomEmbed(message.member)
        .setTitle(title)
        .setHeader("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image)

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
