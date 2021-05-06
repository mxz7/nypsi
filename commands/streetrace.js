const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { userExists, createUser, getInventory, getItems } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("streetrace", "create or join a street race", categories.MONEY).setAliases(["sr"])

const cooldown = new Map()
const races = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    const help = () => {
        const embed = new CustomEmbed(message.member, false).setTitle("street race | " + message.author.username)

        embed.setFooter("you must have a car to join a street race")

        embed.setDescription(`${getPrefix(message.guild)}**sr start <entry fee>** *start a street race*\n` +
            `${getPrefix(message.guild)}**sr join** *join a street race in the current channel*`)
        
        return message.channel.send(embed)
    }

    if (args.length == 0) {
        return help()
    } else if (args[0].toLowerCase() == "start") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${getPrefix(message.guild)}sr start <entry fee>`))
        }

        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
                args[1] = formatBet(args[1])
            } else {
                return message.channel.send(
                    new ErrorEmbed(
                       `${getPrefix(message.guild)}sr start <entry fee>`
                    )
                )
            }
        }

        const bet = parseInt(args[1])

        if (!bet) {
            return message.channel.send(new ErrorEmbed("invalid entry fee"))
        }

        if (bet <= 0) {
            return message.channel.send(
                new ErrorEmbed(`${getPrefix(message.guild)}sr start <entry fee>`)
            )
        }

        if (bet > 500000) {
            return message.channel.send(new ErrorEmbed("entry fee cannot be over $500k"))
        }

        const game = {
            channel: message.channel,
            users: [],
            bet: bet,
            
        }
    }

    const items = getItems(message.member)
    const inventory = getInventory(message.member)

    let car

    for (const item of Array.from(Object.keys(inventory))) {
        if (items[item].role == "car") {
            if (args.length == 0 || args.) {

            }
            if (!car) {
                car = items[item]
            }
        }
    }
}