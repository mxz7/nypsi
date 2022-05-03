import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import { getDatabase } from "../utils/database/database"
import { createCaptcha } from "../utils/utils"

const cmd = new Command("execsql", "execute sql on the database", Categories.NONE).setPermissions(["bot owner"])

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (message.author.id != "672793821850894347") return

    const db = getDatabase()

    const query = db.prepare(args.join(" "))

    const captcha = createCaptcha()

    const embed = new CustomEmbed(message.member, false, "please type the string sent to console")

    console.log(
        "--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---\n" +
            "enter the captcha into discord\n" +
            captcha.display +
            "\n--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---"
    )

    await message.channel.send({ embeds: [embed] })

    const filter = (msg) => message.author.id == msg.author.id

    let response: any = await message.channel.awaitMessages({
        filter,
        max: 1,
    })

    response = response.first().content

    if (response != captcha.answer) {
        return message.channel.send({ embeds: [new ErrorEmbed("captcha failed")] })
    } else {
        let res

        if (args.join(" ").includes("SELECT")) {
            res = query.all()
        } else {
            res = query.run()
        }

        console.log(res)

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `\`\`\`${JSON.stringify(res)}\`\`\``)],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
