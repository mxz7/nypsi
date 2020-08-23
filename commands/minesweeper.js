const { userExists, createUser, getBalance, formatBet, updateBalance, getVoteMulti, updateXp, getXp } = require("../economy/utils")
const { getColor } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")

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

module.exports = {
    name: "minesweeper",
    description: "play minesweeper",
    category: "money",
    aliases: ["sweeper", "ms"],
    run: async (message, args) => {
        
        if (!userExists(message.member)) createUser(message.member)

        const color = getColor(message.member)

        if (games.has(message.author.id)) {
            return message.channel.send("❌ you are already playing minesweeper")
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 30 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("minesweeper help")
                .setColor(color)
                .addField("usage", "$ms <bet>")
                .addField("game rules", "a 5x5 grid of white squares will be created\n" +
                    "there will be numbers and letters on the top and side of the field which act as coordinates\n" +
                    "once youve chosen your square, it will become blue if there was no mine, if there was, you will lose your bet")
                .addField("help", "`a1` - this would be the most top left square\n" +
                    "`e5` - this would be the most bottom right square\n" +
                    "`finish` - this is used to end the game and collect your reward")

            return message.channel.send(embed)
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
            return message.channel.send("❌ invalid bet")
        }

        const bet = parseInt(args[0])

        if (bet <= 0) {
            return message.channel.send("❌ $ms <bet>")
        }

        if (bet > getBalance(message.member)) {
            return message.channel.send("❌ you cannot afford this bet")
        }

        if (bet > 100000) {
            return message.channel.send("❌ maximum bet is $**100k**")
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.member.id)
        }, 30000)

        updateBalance(message.member, getBalance(message.member) - bet)

        const id = Math.random()

        const grid = ["a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a"]

        for (let i = 0; i < 5; i++) {
            const num = Math.floor(Math.random() * 25)

            if (grid[num] != "b") {
                grid[num] = "b"
            } else {
                i--
            }
        }

        const table = toTable(grid)

        const voteMulti = await getVoteMulti(message.member)

        games.set(message.author.id, {
            bet: bet,
            win: 0,
            grid: grid,
            id: id,
            voted: voteMulti
        })

        const embed = new MessageEmbed()
            .setTitle("minesweeper | " + message.author.username)
            .setColor(color)
            .setDescription("**bet** $" + bet.toLocaleString() + "\n**0**x ($0)")
            .addField("your grid", table)
            .addField("help", "type `finish` to stop playing")
            .setFooter("bot.tekoh.wtf")

        const msg = await message.channel.send(embed)

        playGame(message, msg)
    }
}

function getFront(grid) {
    const gridFront = []

    for (item of grid) {
        switch (item){
            case "a":
                gridFront.push(":white_medium_square:")
                break
            case "b":
                gridFront.push(":white_medium_square:")
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
    let table = ":black_large_square::regional_indicator_a::regional_indicator_b::regional_indicator_c::regional_indicator_d::regional_indicator_e:\n:one:"
    let count = 0
    let globalCount = 1

    grid = getFront(grid)

    for (item of grid) {

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
    const bet = games.get(message.author.id).bet
    let win = games.get(message.author.id).win
    const grid = games.get(message.author.id).grid
    const color = getColor(message.member)

    let table

    const embed = new MessageEmbed()
        .setTitle("minesweeper | " + message.author.username)
        .setColor(color)
        .setFooter("bot.tekoh.wtf")
    
    const lose = async () => {
        embed.setColor("#e4334f")
        embed.setDescription("**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")\n\n**you lose!!**")
        embed.addField("your grid", table)
        games.delete(message.author.id)
        return await msg.edit(embed)
    }

    const win1 = async () => {

        let winnings = Math.round(bet * win)

        embed.setColor("#5efb8f")
        if (games.get(message.author.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted)

            if (bet >= 1000) {
                const xpBonus = Math.floor(Math.random() * 2) + 1
                updateXp(message.member, getXp(message.member) + xpBonus)
                embed.setFooter("+" + xpBonus + "xp")
            }

            embed.setDescription("**bet** $" + bet.toLocaleString() + "\n" +
                "**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" +
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString() + "\n" +
                "+**" + (games.get(message.member.user.id).voted * 100).toString() + "**% vote bonus")
        } else {
            embed.setDescription("**bet** $" + bet.toLocaleString() + "\n" +
                "**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" +
                "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString())
        }
        embed.addField("your grid", table)
        updateBalance(message.member, getBalance(message.member) + winnings)
        games.delete(message.author.id)
        return await msg.edit(embed)
    }

    const draw = async () => {
        embed.setColor("#e5ff00")
        embed.setDescription("**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")" + "\n\n**draw!!**\nyou win $" + bet.toLocaleString())
        embed.addField("your grid", table)
        updateBalance(message.member, getBalance(message.member) + bet)
        games.delete(message.author.id)
        return await msg.edit(embed)
    }

    if (win == 15) {
        return win1()
    }

    const filter = m => m.author.id == message.author.id
    let fail = false

    const response = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).then(async collected => {
        await collected.first().delete()
        return collected.first().content.toLowerCase()
    }).catch(() => {
        fail = true
        games.delete(message.author.id)
        return message.channel.send(message.author.toString() + " minesweeper game expired")
    })

    if (fail) return

    if (response.length != 2 && response != "finish") {
        await message.channel.send("❌ " + message.author.toString() + " invalid coordinate, example: `a3`")
        return playGame(message, msg)
    }

    if (response == "finish") {
        table = toTable(grid)
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

        for (n of possibleLetters) {
            if (n == letter) {
                check = true
                break
            } 
        }

        for (n of possibleNumbers) {
            if (n == number) {
                check1 = true
                break
            } 
        }

        if (!check || !check1) {
            await message.channel.send("❌ " + message.author.toString() + " invalid coordinate, example: `a3`")
            return playGame(message, msg)
        }
    }

    const location = toLocation(response)

    switch (grid[location]) {
        case "b":
            grid[location] = "x"
            table = toTable(grid)
            return lose()
        case "c":
            return playGame(message, msg)
        case "a":
            grid[location] = "c"
            win = win + 0.5
            games.set(message.author.id, {
                bet: bet,
                win: win,
                grid: grid,
                id: games.get(message.author.id).id,
                voted: games.get(message.author.id).voted
            })

            table = toTable(grid)

            embed.setDescription("**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")")
            embed.addField("your grid", table)
            embed.addField("help", "type `finish` to stop playing")

            msg.edit(embed)

            return playGame(message, msg)
    }

}