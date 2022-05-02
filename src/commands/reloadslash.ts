import { Message } from "discord.js"
import { Command, Categories } from "../utils/models/Command"
const { uploadGuildCommands, uploadGuildCommandsGlobal } = require("../utils/commandhandler")

const cmd = new Command("reloadslash", "reload data for slash commands", Categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message, args: string[]) {
    if (message.member.user.id != "672793821850894347") return

    if (args.length == 0) {
        await uploadGuildCommands(message.guild.id, message.client.user.id)

        return await message.react("✅")
    } else if (args[0].toLowerCase() == "global") {
        await uploadGuildCommandsGlobal(message.client.user.id)

        return await message.react("✅")
    }
}

cmd.setRun(run)

module.exports = cmd
