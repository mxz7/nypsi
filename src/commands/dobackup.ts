import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { CustomEmbed } = require("../utils/models/EmbedBuilders")
const { doBackup } = require("../utils/database/database")

const cmd = new Command("dobackup", "start a database backup", Categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (message.member.user.id != "672793821850894347") return

    doBackup()

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, "backup started, check console for more info")],
    })
}

cmd.setRun(run)

module.exports = cmd
