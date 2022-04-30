const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { commandExists } = require("../utils/commandhandler")
const { getPrefix } = require("../utils/guilds/utils")
const { getTier, getUserCommand, getCommand, setCommand, isPremium } = require("../utils/premium/utils")

const cmd = new Command("customcommand", "create a custom command", categories.FUN).setAliases(["mycommand", "mycmd"])

const filterxd = [
    "nigger",
    "nigga",
    "faggot",
    "fag",
    "nig",
    "ugly",
    "discordgg",
    "discordcom",
    "discordappcom",
    "gay",
    "tranny",
    "cracker",
    "chink",
    "pornhub",
    "porn",
    "xvideos",
    "xhamster",
    "redtube",
    "grabify",
    "bitly",
]

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!isPremium(message.author.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you must be at least GOLD tier for this command")],
        })
    }

    if (getTier(message.author.id) < 3) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you must be at least GOLD tier for this command")],
        })
    }

    if (args.length == 0) {
        const cmd = getUserCommand(message.author.id)

        const embed = new CustomEmbed(message.member, false)

        if (cmd) {
            if (cmd.content) {
                embed.addField("content", cmd.content, true)
                embed.addField("trigger", cmd.trigger, true)
                embed.addField("uses", cmd.uses ? cmd.uses.toLocaleString() : "0", true)
            } else {
                embed.setDescription("you don't have a custom command")
            }
        } else {
            embed.setDescription("you don't have a custom command")
        }

        embed.setFooter(`use ${getPrefix(message.guild)}mycmd <content> to set the content of your custom command`)

        return message.channel.send({ embeds: [embed] })
    } else {
        const content = args.join(" ")

        if (content.length > 100) {
            return message.channel.send({ embeds: [new ErrorEmbed("content must be 100 characters or less")] })
        }

        if (content.split("\n").length > 4) {
            return message.channel.send({
                embeds: [new ErrorEmbed("please make sure that your custom command cant be used to flood chat")],
            })
        }

        let contentToTest = message.content.toLowerCase().normalize("NFD")

        contentToTest = contentToTest.replace(/[^A-z0-9\s]/g, "")

        for (const word of filterxd) {
            if (contentToTest.includes(word)) {
                return message.channel.send({ embeds: [new ErrorEmbed("explicit content 🙄")] })
            }
        }

        await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "please enter your command name / trigger")],
        })

        const filter = (msg) => message.author.id == msg.author.id

        let fail = false

        let res = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] }).catch(() => {
            fail = true
            return message.channel.send({ embeds: [new ErrorEmbed("you took too long")] })
        })

        if (fail) return

        res = res.first().content.split(" ")[0].toLowerCase()

        if (res.length > 25) {
            return message.channel.send({
                embeds: [new ErrorEmbed("trigger cannot be longer than 25 characters")],
            })
        }

        let resToTest = res.normalize("NFD")

        resToTest = resToTest.replace(/[^A-z0-9\s]/g, "")

        for (const word of filterxd) {
            if (resToTest.includes(word)) {
                return message.channel.send({ embeds: [new ErrorEmbed("explicit content 🙄")] })
            }
        }

        if (commandExists(res)) {
            return message.channel.send({ embeds: [new ErrorEmbed("this command already exists")] })
        }

        let trigger = getUserCommand(message.author.id)

        if (trigger) {
            trigger = trigger.trigger
        }

        if (getCommand(res) && trigger != res) {
            return message.channel.send({ embeds: [new ErrorEmbed("this command already exists")] })
        }

        setCommand(message.author.id, res, content)

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ your custom command has been updated")],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
