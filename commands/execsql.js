const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getDatabase } = require("../utils/database/database")
const { createCaptcha } = require("../utils/utils")

const cmd = new Command("execsql", "execute sql on the database", categories.NONE).setPermissions(["bot owner"])

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    const db = getDatabase()

    const query = db.prepare(args.join(" "))

    const captcha = createCaptcha()

    const embed = new CustomEmbed(message.member, false, "please type the string sent to console")

    console.log(
        "--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---\n" +
            "captcha generated to reset economy\n" +
            captcha.display +
            "\n--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---"
    )

    await message.channel.send({ embeds: [embed] })

    const filter = (msg) => message.author.id == msg.author.id

    let response = await message.channel.awaitMessages({
        filter,
        max: 1,
    })

    response = response.first().content

    if (response != captcha.answer) {
        return message.channel.send({ embeds: [new ErrorEmbed("captcha failed")] })
    } else {
        const d = query.run()

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `made \`${d.changes}\` changes`)],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
