const {
    userExists,
    createUser,
    getBalance,
    formatBet,
    updateBalance,
    updateXp,
    getXp,
    calcMaxBet,
    getMulti,
    getPrestige,
    addGamble,
} = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { gamble } = require("../utils/logger.js")

const cooldown = new Map()
const games = new Map()
const abcde = new Map()
const possibleLetters = ["a", "b", "c", "d", "e"]
const possibleNumbers = ["1", "2", "3", "4", "5"]

abcde.set("a", 0)
abcde.set("b", 1)
abcde.set("c", 2)
abcde.set("d", 3)
abcde.set("e", 4)

const cmd = new Command("minesweeper", "play minesweeper", categories.MONEY).setAliases(["sweeper", "ms"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    if (games.has(message.author.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you are already playing minesweeper")] })
    }

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
        } else {
            cooldownLength = 15
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("minesweeper help")
            .addField("usage", `${prefix}ms <bet>`)
            .addField(
                "game rules",
                "a 5x5 grid of white squares will be created\n" +
                    "there will be numbers and letters on the top and side of the field which act as coordinates\n" +
                    "once youve chosen your square, it will become blue if there was no mine, if there was, you will lose your bet"
            )
            .addField(
                "help",
                "`a1` - this would be the most top left square\n" +
                    "`e5` - this would be the most bottom right square\n" +
                    "`finish` - this is used to end the game and collect your reward"
            )

        return message.channel.send({ embeds: [embed] })
    }

    if (args[0] == "all") {
        args[0] = getBalance(message.member)
    }

    if (args[0] == "half") {
        args[0] = getBalance(message.member) / 2
    }

    if (parseInt(args[0])) {
        args[0] = formatBet(args[0])
    } else {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    const bet = parseInt(args[0])

    if (!bet) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid bet")] })
    }

    if (bet <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}ms <bet>`)] })
    }

    if (bet > getBalance(message.member)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you cannot afford this bet")] })
    }

    const maxBet = await calcMaxBet(message.member)

    if (bet > maxBet) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    setTimeout(() => {
        if (games.has(message.author.id)) {
            if (games.get(message.author.id).id == id) {
                games.delete(message.author.id)
                updateBalance(message.member, getBalance(message.member) + bet)
                if (cooldown.has(message.author.id)) {
                    cooldown.delete(message.author.id)
                }
            }
        }
    }, 180000)

    updateBalance(message.member, getBalance(message.member) - bet)

    const id = Math.random()

    const grid = [
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
    ]

    const bombs = Math.floor(Math.random() * 3) + 4

    for (let i = 0; i < bombs; i++) {
        const num = Math.floor(Math.random() * 25)

        if (grid[num] != "b") {
            grid[num] = "b"
        } else {
            i--
        }
    }

    const table = toTable(grid)

    const voteMulti = await getMulti(message.member)

    games.set(message.author.id, {
        bet: bet,
        win: 0,
        grid: grid,
        id: id,
        voted: voteMulti,
    })

    const embed = new CustomEmbed(message.member, true, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)")
        .setTitle("minesweeper | " + message.author.username)
        .addField("your grid", table)
        .addField("help", "type `finish` to stop playing")

    const msg = await message.channel.send({ embeds: [embed] })

    playGame(message, msg).catch((e) => {
        console.error(e)
        return message.channel.send({
            embeds: [new ErrorEmbed("an error occured while running - join support server")],
        })
    })
}

cmd.setRun(run)

module.exports = cmd

function getFront(grid) {
    const gridFront = []

    for (let item of grid) {
        switch (item) {
            case "a":
                gridFront.push(":white_large_square:")
                break
            case "b":
                gridFront.push(":white_large_square:")
                break
            case "c":
                gridFront.push(":blue_square:")
                break
            case "x":
                gridFront.push(":red_square:")
                break
        }
    }

    return gridFront
}

function getExposedFront(grid) {
    const gridFront = []

    for (let item of grid) {
        switch (item) {
            case "a":
                gridFront.push(":white_large_square:")
                break
            case "b":
                gridFront.push(":red_square:")
                break
            case "c":
                gridFront.push(":blue_square:")
                break
            case "x":
                gridFront.push(":red_square:")
                break
        }
    }

    return gridFront
}

function toTable(grid) {
    let table =
        ":black_large_square::regional_indicator_a::regional_indicator_b::regional_indicator_c::regional_indicator_d::regional_indicator_e:\n:one:"
    let count = 0
    let globalCount = 1

    grid = getFront(grid)

    for (let item of grid) {
        if (count == 5) {
            count = 0

            let emoji

            switch (globalCount) {
                case 1:
                    emoji = ":two:"
                    break
                case 2:
                    emoji = ":three:"
                    break
                case 3:
                    emoji = ":four:"
                    break
                case 4:
                    emoji = ":five:"
                    break
            }
            globalCount++

            table = table + "\n" + emoji + item
        } else {
            table = table + item
        }
        count++
    }

    return table
}

function toExposedTable(grid) {
    let table =
        ":black_large_square::regional_indicator_a::regional_indicator_b::regional_indicator_c::regional_indicator_d::regional_indicator_e:\n:one:"
    let count = 0
    let globalCount = 1

    grid = getExposedFront(grid)

    for (let item of grid) {
        if (count == 5) {
            count = 0

            let emoji

            switch (globalCount) {
                case 1:
                    emoji = ":two:"
                    break
                case 2:
                    emoji = ":three:"
                    break
                case 3:
                    emoji = ":four:"
                    break
                case 4:
                    emoji = ":five:"
                    break
            }
            globalCount++

            table = table + "\n" + emoji + item
        } else {
            table = table + item
        }
        count++
    }

    return table
}

function toLocation(coordinate) {
    const letter = coordinate.split("")[0]
    const number = coordinate.split("")[1]

    switch (number) {
        case "1":
            return abcde.get(letter)
        case "2":
            return abcde.get(letter) + 5
        case "3":
            return abcde.get(letter) + 10
        case "4":
            return abcde.get(letter) + 15
        case "5":
            return abcde.get(letter) + 20
    }
}

async function playGame(message, msg) {
    if (!games.has(message.author.id)) return

    const bet = games.get(message.author.id).bet
    let win = games.get(message.author.id).win
    const grid = games.get(message.author.id).grid

    let table

    const embed = new CustomEmbed(message.member, true).setTitle("minesweeper | " + message.author.username)

    const lose = async () => {
        gamble(message.author, "minesweeper", bet, false, 0)
        addGamble(message.member, "minesweeper", false)
        embed.setColor("#e4334f")
        embed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")\n\n**you lose!!**"
        )
        embed.addField("your grid", table)
        games.delete(message.author.id)
        return await msg.edit({ embeds: [embed] })
    }

    const win1 = async () => {
        let winnings = Math.round(bet * win)

        embed.setColor("#5efb8f")
        if (games.get(message.author.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            let requiredBet = 1000

            if (getPrestige(message.member) > 2) requiredBet = 10000

            requiredBet += getPrestige(message.member) * 1000

            if (bet >= requiredBet) {
                const xpBonus = Math.floor(Math.random() * 2) + getPrestige(message.member)

                const givenXp = xpBonus > 7 ? 7 : xpBonus

                updateXp(message.member, getXp(message.member) + givenXp)
                embed.setFooter("+" + givenXp + "xp")
            }

            embed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString() +
                    "\n" +
                    "+**" +
                    Math.floor(games.get(message.member.user.id).voted * 100).toString() +
                    "**% bonus"
            )
        } else {
            embed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString()
            )
        }
        gamble(message.author, "minesweeper", bet, true, winnings)
        addGamble(message.member, "minesweeper", true)
        embed.addField("your grid", table)
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.author.id)
        return await msg.edit({ embeds: [embed] })
    }

    const draw = async () => {
        gamble(message.author, "minesweeper", bet, true, bet)
        addGamble(message.member, "minesweeper", true)
        embed.setColor("#e5ff00")
        embed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")" +
                "\n\n**draw!!**\nyou win $" +
                bet.toLocaleString()
        )
        embed.addField("your grid", table)
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.author.id)
        return await msg.edit({ embeds: [embed] })
    }

    if (win == 15) {
        return win1()
    }

    const filter = (m) => m.author.id == message.author.id
    let fail = false

    const response = await message.channel
        .awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] })
        .then(async (collected) => {
            await collected.first().delete()
            return collected.first().content.toLowerCase()
        })
        .catch(() => {
            fail = true
            games.delete(message.author.id)
            return message.channel.send({ content: message.author.toString() + " minesweeper game expired" })
        })

    if (fail) return

    if (response.length != 2 && response != "finish") {
        await message.channel.send({ content: message.author.toString() + " invalid coordinate, example: `a3`" })
        return playGame(message, msg)
    }

    if (response == "finish") {
        table = toExposedTable(grid)
        if (win < 1) {
            return lose()
        } else if (win == 1) {
            return draw()
        } else {
            return win1()
        }
    } else {
        const letter = response.split("")[0]
        const number = response.split("")[1]

        let check = false
        let check1 = false

        for (let n of possibleLetters) {
            if (n == letter) {
                check = true
                break
            }
        }

        for (let n of possibleNumbers) {
            if (n == number) {
                check1 = true
                break
            }
        }

        if (!check || !check1) {
            await message.channel.send({
                content: message.author.toString() + " invalid coordinate, example: `a3`",
            })
            return playGame(message, msg)
        }
    }

    const location = toLocation(response)

    switch (grid[location]) {
        case "b":
            grid[location] = "x"
            table = toExposedTable(grid)
            return lose()
        case "c":
            return playGame(message, msg)
        case "a":
            grid[location] = "c"

            if (win < 3) {
                win += 0.5
            } else {
                win += 1
            }

            games.set(message.author.id, {
                bet: bet,
                win: win,
                grid: grid,
                id: games.get(message.author.id).id,
                voted: games.get(message.author.id).voted,
            })

            table = toTable(grid)

            embed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            )
            embed.addField("your grid", table)
            embed.addField("help", "type `finish` to stop playing")

            msg.edit({ embeds: [embed] })

            return playGame(message, msg)
    }
}
