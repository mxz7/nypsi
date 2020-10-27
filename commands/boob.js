const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { redditImage } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("boob", "get a random boob image", categories.NSFW).setAliases(["boobs", "boobies", "tits", "titties", "booby", "boobie"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
        
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    if (!message.channel.nsfw) {
        return message.channel.send(new ErrorEmbed("you must do this in an nsfw channel"))
    }

    const { boobCache } = require("../utils/imghandler")

    if (boobCache.size <= 2) {
        return message.channel.send(new ErrorEmbed("please wait a couple more seconds.."))
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 5000);

    const boobLinks = Array.from(boobCache.keys())

    const subredditChoice = boobLinks[Math.floor(Math.random() * boobLinks.length)]

    const allowed = boobCache.get(subredditChoice)

    const chosen = allowed[Math.floor(Math.random() * allowed.length)]

    const a = await redditImage(chosen, allowed)

    if (a == "lol") {
        return message.channel.send(new ErrorEmbed("unable to find boob image"))
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

    message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd