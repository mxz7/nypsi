import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders"

const cmd = new Command("servericon", "get the server icon", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    return message.channel.send({
        embeds: [
            new CustomEmbed(message.member, false).setImage(
                message.guild.iconURL({
                    size: 256,
                    dynamic: true,
                })
            ),
        ],
    })
}

cmd.setRun(run)

module.exports = cmd
