import { Client } from "discord.js"
// @ts-ignore
import { version } from "../../package.json"
import { getRandomCommand } from "../utils/commandhandler"
import { logger } from "../utils/logger"
import { daysUntilChristmas } from "../utils/utils"

declare function require(name: string)

/**
 * @param {Client} client
 * @param {Number} startUp
 */
export default function ready(client: Client, startUp: number) {
    const games = ["$help | nypsi.xyz", "$help | tekoh.net", "$help | nypsi.xyz", "x0x", "xmas"]

    setTimeout(() => {
        const a = getRandomCommand()

        let game = games[Math.floor(Math.random() * games.length)]

        if (game == "x0x") {
            game = `$${a.name} - ${a.description}`
        } else if (game == "xmas") {
            game = `${daysUntilChristmas()} days until christmas`
        }

        client.user.setPresence({
            status: "dnd",
            activities: [
                {
                    name: game,
                },
            ],
        })
    }, 5000)

    setInterval(() => {
        const a = getRandomCommand()

        let game = games[Math.floor(Math.random() * games.length)]

        if (game == "x0x") {
            game = `$${a.name} - ${a.description}`
        } else if (game == "xmas") {
            game = `${daysUntilChristmas()} days until christmas`
        }

        client.user.setPresence({
            status: "dnd",
            activities: [
                {
                    name: game,
                },
            ],
        })
    }, 30 * 60 * 1000)

    const { commandsSize } = require("../utils/commandhandler")

    let memberCount = 0

    client.guilds.cache.forEach((g) => {
        memberCount = memberCount + g.memberCount
    })

    logger.info("server count: " + client.guilds.cache.size.toLocaleString())
    logger.info("user count: " + memberCount.toLocaleString())
    logger.info("commands count: " + commandsSize)
    logger.info(`version: ${version}`)

    logger.info("logged in as " + client.user.tag)

    const now = Date.now()
    const timeTaken = (now - startUp) / 1000

    logger.info(`time taken: ${timeTaken}s\n`)
}
