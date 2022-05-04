import { CommandInteraction, Message } from "discord.js"
import { runChristmas } from "../utils/guilds/utils"
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command"

const cmd = new Command("forcechristmas", "force christmas countdown", Categories.NONE).setPermissions(["bot owner"])

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (message.author.id != "672793821850894347") return

    runChristmas(message.client, true)
}

cmd.setRun(run)

export default cmd
