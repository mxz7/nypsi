const { Message } = require("discord.js")
const { getBorderCharacters } = require("table")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { userExists, createUser, getInventory, getItems, formatBet, getBalance, calcMaxBet, updateBalance } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("streetrace", "create or join a street race", categories.MONEY).setAliases(["sr"])

const races = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

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

        if (races.has(message.channel.id)) {
            return message.channel.send(new ErrorEmbed("there is already a street race in this channel"))
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
        
        const id = Math.random()

        const game = {
            channel: message.channel,
            users: new Map(),
            bet: bet,
            message: undefined,
            id: id,
            start: new Date().getTime() + 30000,
            embed: undefined,
            started: false
        }

        const embed = new CustomEmbed(message.member).setTitle("street race")

        embed.setFooter(`use ${getPrefix(message.guild)}sr join to join`)

        embed.setDescription(`no racers\n\nentry fee: $${bet.toLocaleString()}`)

        const msg = await message.channel.send(embed)

        game.message = msg
        game.embed = embed

        races.set(message.channel.id, game)

        setTimeout(() => {
            if (!races.has(message.channel.id)) return
            if (races.get(message.channel.id).id != id) return
            if (races.get(message.channel.id).users.size < 2) {
                embed.setDescription("race cancelled ):")
                msg.edit(embed)

                for (let user of races.get(message.channel.id).users.keys()) {
                    user = races.get(message.channel.id).users.get(user)

                    updateBalance(user.user.id, getBalance(user.user.id) + bet)
                }
                races.delete(message.channel.id)
            } else {
                if (races.get(message.channel.id).started) return
                startRace(message.channel.id)
                const d = races.get(message.channel.id)
                d.started = true
                races.set(message.channel.id, d)
            }
        }, 30000)
    } else if (args[0].toLowerCase() == "join") {
        if (!races.get(message.channel.id)) {
            return message.channel.send(
                new ErrorEmbed("there is currently no street race in this channel")
            )
        }

        if (races.get(message.channel.id).users.has(message.author.id)) {
            return
        }

        if (races.get(message.channel.id).started) {
            return message.channel.send(new ErrorEmbed("this race has already started"))
        }

        const race = races.get(message.channel.id)

        if (race.bet > getBalance(message.member)) {
            return message.channel.send(new ErrorEmbed("you cant afford the entry fee"))
        }

        const maxBet = await calcMaxBet(message.member)

        if (race.bet > maxBet) {
            return message.channel.send(
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                )
            )
        }

        const items = getItems(message.member)
        const inventory = getInventory(message.member)

        let car

        if (args.length == 1) {
            for (const item of Array.from(Object.keys(inventory))) {
                if (items[item].role == "car") {
                    if (inventory[item] && inventory[item] > 0) {
                        car = items[item]
                        break
                    }
                }
            }
            if (!car) return message.channel.send(new ErrorEmbed("you don't have a car"))
        } else {
            const searchTag = args[1].toLowerCase()
            for (const itemName of Array.from(Object.keys(items))) {
                if (items[itemName].role != "car") continue
                const aliases = items[itemName].aliases ? items[itemName].aliases : []
                if (searchTag == itemName) {
                    car = itemName
                    break
                } else if (searchTag == itemName.split("_").join("")) {
                    car = itemName
                    break
                } else if (aliases.indexOf(searchTag) != -1) {
                    car = itemName
                    break
                }
            }

            if (!car) {
                return message.channel.send(new ErrorEmbed(`couldnt find \`${args[0]}\``))
            }

            if (!inventory[car.id] || inventory[car.id] == 0) {
                return message.channel.send(new ErrorEmbed(`you don't have a ${car.name}`))
            }
        }

        updateBalance(message.member, getBalance(message.member) - race.bet)

        race.users.set(message.author.id, {
            user: message.author,
            car: car,
            position: 0
        })

        const embed = race.embed

        let description = ""

        for (let user of race.users.keys()) {
            user = race.users.get(user)

            description += `\n\`${user.user.tag}\` ${user.car.emoji}\\_\\_\\_\\_\\_\\_\\_\\_\\_ 🏁`
        }

        description += `\n\nentry fee: $${race.bet.toLocaleString()}`

        embed.setDescription(description)

        await race.message.edit(embed)
    }
}

cmd.setRun(run)

module.exports = cmd

/**
 * @returns {Number}
 * @param {Number} current
 * @param {Number} speed 
 */
function getNewPosition(current, speed) {
    const randomness = Math.floor(Math.random() * 5) - 2

    const movement = speed * 1.4 + randomness

    return current + movement
}

/**
 * @returns {String}
 * @param {String} emoji 
 * @param {Number} position 
 */
function getRacePosition(emoji, position) {
    const racePos = Math.floor(position / 5)

    let line = ""
    let underscores = 0

    for (underscores; underscores < racePos; underscores++) {
        line += "\\_"
    }

    line += emoji

    for (underscores; underscores < 9; underscores++) {
        line += "\\_"
    }

    return line
}

async function startRace(id) {
    const race = races.get(id)
    const users = race.users

    for (let user of race.users.keys()) {
        user = race.users.get(user)

        let newPos = getNewPosition(user.position, user.car.speed)

        user.position = newPos

        race.users.set(user.user.id, user)
    }

    const embed = race.embed

    let description = ""

    for (let user of race.users.keys()) {
        user = race.users.get(user)

        description += `\n\`${user.user.tag}\` ${getRacePosition(user.car.emoji, user.position)} 🏁`
    }

    embed.setDescription(description)

    await race.message.edit(embed)

    races.set(id, race) // do win thing

    setTimeout(() => {
        return startRace(id)
    }, 1000)
}