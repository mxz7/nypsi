const { Client } = require("discord.js")
const { getUserCount } = require("../../economy/utils")
const { getRandomCommand } = require("../commandhandler")
const { daysUntilChristmas, getTimestamp } = require("../utils")

/**
 * @param {Client} client
 * @param {Number} startUp
 */
module.exports = async (client, startUp) => {
    const games = [
        "$help | nypsi.xyz",
        "$help | tekoh.net",
        "$help | nypsi.xyz",
        "$help | nypsi.xyz",
        "$help | nypsi.xyz",
        "have you joined the $support server?",
        "x0x",
        "x0x",
        "x0x",
        "xmas",
    ]

    setTimeout(async () => {
        const a = await getRandomCommand()

        let game = games[Math.floor(Math.random() * games.length)]

        if (game == "x0x") {
            game = `$${a.name} - ${a.description}`
        } else if (game == "xmas") {
            game = `${daysUntilChristmas()} days until christmas`
        }

        client.user.setPresence({
            status: "dnd",
            activity: {
                name: game,
            },
        })
    }, 5000)

    setInterval(async () => {
        const a = await getRandomCommand()

        let game = games[Math.floor(Math.random() * games.length)]

        if (game == "x0x") {
            game = `$${a.name} - ${a.description}`
        } else if (game == "xmas") {
            game = `${daysUntilChristmas()} days until christmas`
        }

        client.user.setPresence({
            status: "dnd",
            activity: {
                name: game,
            },
        })
    }, 15 * 60 * 1000)

    const { commandsSize } = require("../commandhandler")

    let memberCount = 0

    await client.guilds.cache.forEach((g) => {
        memberCount = memberCount + g.memberCount
    })

    console.log("\nserver count: " + client.guilds.cache.size.toLocaleString())
    console.log("user count: " + memberCount.toLocaleString())
    console.log("commands count: " + commandsSize)
    console.log("users in currency: " + getUserCount())

    console.log("\nlogged in as " + client.user.tag + " @ " + getTimestamp())

    const now = Date.now()
    const timeTaken = (now - startUp) / 1000

    console.log(`time taken: ${timeTaken}s\n`)
}
