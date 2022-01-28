const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getDatabase } = require("../utils/database/database")
const { logger } = require("../utils/logger")

const cmd = new Command("deletealldeletable", "reload commands", categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    const { mentionQueue } = require("../utils/users/utils")

    const arr = []

    for (const item of mentionQueue) {
        if (item.type == "delete") {
            arr.push(item)
            mentionQueue.splice(mentionQueue.indexOf(item), 1)
        }
    }

    const db = getDatabase()

    const deleteM = db.prepare("DELETE FROM mentions WHERE url = ?").run

    const interval = setInterval(() => {
        const mention = arr.shift()

        deleteM(mention.url)

        if (arr.length == 0) {
            clearInterval(interval)
            return
        } else {
            if (arr.length < 1000) {
                logger.info("deletable less than 1000")
            }
            if (arr.length < 50000) {
                logger.info("deletable less than 50k")
            }
            if (arr.length < 100000) {
                logger.info("deletable less than 100k")
            }
            if (arr.length < 350000) {
                logger.info("deletable less than 350k")
            }
            if (arr.length < 500000) {
                logger.info("deletable less than 500k")
            }
        }
    }, 10)
}

cmd.setRun(run)

module.exports = cmd
