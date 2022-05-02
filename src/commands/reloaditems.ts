import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { CustomEmbed } = require("../utils/models/EmbedBuilders")
const { loadItems } = require("../utils/economy/utils")

const cmd = new Command("reloaditems", "reload items", Categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | NypsiCommandInteraction & CommandInteraction) {
    if (message.member.user.id != "672793821850894347") return

    const d = loadItems()

    return message.channel.send({ embeds: [new CustomEmbed(message.member, false, d)] })
}

cmd.setRun(run)

module.exports = cmd
