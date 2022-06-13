import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import {
    userExists,
    createUser,
    getInventory,
    getItems,
    formatBet,
    getBalance,
    calcMaxBet,
    updateBalance,
} from "../utils/economy/utils"
import { getPrefix } from "../utils/guilds/utils"
import { Item } from "../utils/models/Economy"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"

const cmd = new Command("streetrace", "create or join a street race", Categories.MONEY).setAliases(["sr"])

cmd.slashEnabled = true
cmd.slashData
    .addSubcommand((start) =>
        start
            .setName("start")
            .setDescription("start a race")
            .addIntegerOption((option) =>
                option.setName("bet").setDescription("this is the bet and the entry fee for the race").setRequired(true)
            )
    )
    .addSubcommand((join) =>
        join
            .setName("join")
            .setDescription("join an existing race in the channel (you will need a car, or you can use the bicycle)")
            .addStringOption((option) =>
                option
                    .setName("car")
                    .setDescription("what car would you like to use")
                    .addChoice("🚗 fiat", "fiat")
                    .addChoice("🚗 ford fiesta", "ford_fiesta")
                    .addChoice("🚗 mitsubishi lancer evo x", "lancer_evox")
                    .addChoice("🚗 lightning mcqueen", "lightning_mcqueen")
                    .addChoice("🏎️ nissan skyline gtr r34", "skyline_r34")
                    .addChoice("🚗 smart car", "smart_car")
                    .addChoice("🚗 subuwu", "subaru_wrx")
                    .addChoice("🚗 tesla model x", "tesla_modelx")
                    .addChoice("🏎️ toyota supra mk4", "toyota_supra")
                    .addChoice("🚗 corsa 2003", "vauxhall_corsa")
                    .addChoice("🚲 bicycle", "bike")
            )
    )

const races = new Map()
const carCooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) createUser(message.member)

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    const help = () => {
        const embed = new CustomEmbed(message.member, false).setHeader("street race")

        embed.setDescription(
            `${getPrefix(message.guild)}**sr start <entry fee>** *start a street race*\n` +
                `${getPrefix(message.guild)}**sr join** *join a street race in the current channel*`
        )

        return send({ embeds: [embed] })
    }

    if (args.length == 0) {
        return help()
    } else if (args[0].toLowerCase() == "start") {
        if (await onCooldown(cmd.name, message.member)) {
            const embed = await getResponse(cmd.name, message.member)

            return message.channel.send({ embeds: [embed] })
        }

        if (args.length == 1) {
            return send({
                embeds: [new ErrorEmbed(`${getPrefix(message.guild)}sr start <entry fee> (speed limit)`)],
            })
        }

        if (races.has(message.channel.id)) {
            return send({
                embeds: [new ErrorEmbed("there is already a street race in this channel")],
            })
        }

        const bet = await formatBet(args[1], message.member)

        if (!bet) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
        }

        if (isNaN(bet)) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
        }

        if (bet <= 0) {
            return send({
                embeds: [new ErrorEmbed(`${getPrefix(message.guild)}sr start <entry fee> (speed limit)`)],
            })
        }

        if (bet < 1000) {
            return send({ embeds: [new ErrorEmbed("entry fee cannot be less than $1k")] })
        }

        if (bet > 500000) {
            return send({ embeds: [new ErrorEmbed("entry fee cannot be over $500k")] })
        }

        let speedLimit = 0

        if (args[2]) {
            if (!parseInt(args[2])) {
                return send({ embeds: [new ErrorEmbed("speed limit must be a number 1-6")] })
            }
            speedLimit = parseInt(args[2])

            if (!speedLimit) {
                return send({ embeds: [new ErrorEmbed("invalid speed limit")] })
            }

            if (speedLimit > 6 || speedLimit < 1) {
                return send({ embeds: [new ErrorEmbed("speed limit must be a number 1-6")] })
            }
        }

        await addCooldown(cmd.name, message.member, 180)

        const id = Math.random()

        const game = {
            channel: message.channel,
            users: new Map(),
            bet: bet,
            message: undefined,
            id: id,
            start: new Date().getTime() + 30000,
            embed: undefined,
            started: false,
            speedLimit: speedLimit,
        }

        const embed = new CustomEmbed(message.member).setHeader(
            `${message.author.username}'s street race`,
            message.author.avatarURL()
        )

        embed.setFooter(`use ${getPrefix(message.guild)}sr join to join`)

        embed.setDescription(
            `no racers\n\nentry fee: $${bet.toLocaleString()}${speedLimit != 0 ? `\nspeed limit: ${speedLimit}` : ""}`
        )

        const msg = await message.channel.send({ embeds: [embed] })

        game.message = msg
        game.embed = embed

        races.set(message.channel.id, game)

        setTimeout(() => {
            if (!races.has(message.channel.id)) return
            if (races.get(message.channel.id).id != id) return
            if (races.get(message.channel.id).users.size < 2) {
                embed.setDescription("race cancelled ):")
                embed.setFooter("race cancelled")
                msg.edit({ embeds: [embed] }).catch(() => {})

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
                setTimeout(() => {
                    if (races.has(message.channel.id) && races.get(message.channel.id).id == id) {
                        races.delete(message.channel.id)
                    }
                }, 300000)
            }
        }, 30000)
    } else if (args[0].toLowerCase() == "join") {
        if (!races.get(message.channel.id)) {
            return send({
                embeds: [new ErrorEmbed("there is currently no street race in this channel")],
            })
        }

        if (races.get(message.channel.id).users.has(message.author.id)) {
            return
        }

        if (races.get(message.channel.id).started) {
            return send({ embeds: [new ErrorEmbed("this race has already started")] })
        }

        const race = races.get(message.channel.id)

        if (race.bet > getBalance(message.member)) {
            return send({ embeds: [new ErrorEmbed("you cant afford the entry fee")] })
        }

        const maxBet = await calcMaxBet(message.member)

        if (race.bet > maxBet) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                    ),
                ],
            })
        }

        const items = getItems()
        const inventory = getInventory(message.member)

        let car: Item
        let cycle = false

        if (args.length == 1) {
            for (const item of Array.from(Object.keys(inventory))) {
                if (items[item].role == "car") {
                    if (inventory[item] && inventory[item] > 0) {
                        if (car) {
                            if (car.speed < items[item].speed) {
                                if (carCooldown.has(message.author.id)) {
                                    const current = carCooldown.get(message.author.id)
                                    if (current.includes(items[item].id)) continue
                                }
                                car = items[item]
                            }
                        } else {
                            if (carCooldown.has(message.author.id)) {
                                const current = carCooldown.get(message.author.id)
                                if (current.includes(items[item].id)) continue
                            }
                            car = items[item]
                        }
                    }
                }
            }
            if (!car) cycle = true
        } else {
            let carName: string

            const searchTag = args[1].toLowerCase()
            for (const itemName of Array.from(Object.keys(items))) {
                if (items[itemName].role != "car") continue
                const aliases = items[itemName].aliases ? items[itemName].aliases : []
                if (searchTag == itemName) {
                    carName = itemName
                    break
                } else if (searchTag == itemName.split("_").join("")) {
                    carName = itemName
                    break
                } else if (aliases.indexOf(searchTag) != -1) {
                    carName = itemName
                    break
                }
            }

            if (!carName) {
                return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] })
            } else {
                car = items[carName]
            }

            if ((!inventory[car.id] || inventory[car.id] == 0) && car.id != "cycle") {
                return send({ embeds: [new ErrorEmbed(`you don't have a ${car.name}`)] })
            }
        }

        if (cycle) {
            car = items["cycle"]
        }

        if (race.speedLimit > 0 && car.speed > race.speedLimit) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `your ${car.name} is too fast for this race, select another with ${getPrefix(
                            message.guild
                        )}**sr join <car>**`
                    ),
                ],
            })
        }

        if (carCooldown.has(message.author.id)) {
            let current = carCooldown.get(message.author.id)

            if (current.includes(car.id)) {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            `your ${car.name} is on cooldown, select another with ${getPrefix(
                                message.guild
                            )}**sr join <car>**`
                        ),
                    ],
                })
            } else {
                current.push(car.id)
                if (car.id != "cycle") {
                    carCooldown.set(message.author.id, current)

                    setTimeout(() => {
                        current = carCooldown.get(message.author.id)
                        current.splice(current.indexOf(car.id), 1)

                        if (current.length == 0) {
                            carCooldown.delete(message.author.id)
                        } else {
                            carCooldown.set(message.author.id, current)
                        }
                    }, 120000)
                }
            }
        } else {
            if (car.id != "cycle") {
                carCooldown.set(message.author.id, [car.id])

                setTimeout(() => {
                    const current = carCooldown.get(message.author.id)
                    current.splice(current.indexOf(car.id), 1)

                    if (current.length == 0) {
                        carCooldown.delete(message.author.id)
                    } else {
                        carCooldown.set(message.author.id, current)
                    }
                }, 120000)
            }
        }

        updateBalance(message.member, getBalance(message.member) - race.bet)

        race.users.set(message.author.id, {
            user: message.author,
            car: car,
            position: 0,
        })

        const embed = race.embed

        let description = ""

        for (let user of race.users.keys()) {
            user = race.users.get(user)

            description += `\n\`${user.user.username}\` ${user.car.emoji}\\_\\_\\_\\_\\_\\_\\_\\_\\_ 🏁`
        }

        const speedLimit = race.speedLimit

        description += `\n\nentry fee: $${race.bet.toLocaleString()}${speedLimit != 0 ? `\nspeed limit: ${speedLimit}` : ""}`

        embed.setDescription(description)

        await race.message.edit({ embeds: [embed] })

        if (!(message instanceof Message)) {
            await message.reply({
                embeds: [new CustomEmbed(message.member, false, "you have joined the race")],
                ephemeral: true,
            })
        } else {
            await message.react("✅")

            setTimeout(async () => {
                await message.delete().catch(() => {})
            }, 1500)
        }

        if (race.users.size >= 25) {
            race.started = true
            const id = races.get(message.channel.id).id
            setTimeout(() => {
                if (races.has(message.channel.id) && races.get(message.channel.id).id == id) {
                    races.delete(message.channel.id)
                }
            }, 300000)
            return startRace(message.channel.id)
        }
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
    const randomness = Math.floor(Math.random() * 12) - 4

    const movement = speed + randomness

    if (current + movement < current) return current

    return current + movement
}

/**
 * @returns {String}
 * @param {String} emoji
 * @param {Number} position
 */
function getRacePosition(emoji, position) {
    let racePos = Math.floor(position / 5)

    if (racePos > 9) racePos = 9

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

    /**
     * @type {User}
     */
    let winner

    for (let user of race.users.keys()) {
        user = race.users.get(user)

        const newPos = getNewPosition(user.position, user.car.speed)

        user.position = newPos

        race.users.set(user.user.id, user)

        if (newPos >= 50) {
            winner = user.user
            break
        }
    }

    const embed = race.embed

    let description = ""

    for (let user of race.users.keys()) {
        user = race.users.get(user)

        description += `\n\`${user.user.username}\` ${getRacePosition(user.car.emoji, user.position)} 🏁`
    }

    embed.setDescription(description)
    embed.setFooter("race has started")

    await race.message.edit({ embeds: [embed] }).catch(() => {})

    races.set(id, race)

    if (winner) {
        const winnings = race.bet * race.users.size

        updateBalance(winner.id, getBalance(winner.id) + race.bet * race.users.size)

        description +=
            `\n\n**${winner.tag}** has won with their ${race.users.get(winner.id).car.name} ${
                race.users.get(winner.id).car.emoji
            }\n` + `+$${winnings.toLocaleString()}`

        embed.setDescription(description)
        embed.setFooter("race has ended")

        return setTimeout(async () => {
            await race.message.edit({ embeds: [embed] }).catch(() => {})
            return races.delete(id)
        }, 500)
    }

    setTimeout(() => {
        return startRace(id)
    }, 1000)
}
