const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { reset } = require("../utils/economy/utils")
const { createCaptcha } = require("../utils/utils")

const cmd = new Command("reseteco", "reset economy except prestige", categories.NONE)

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    if (message.author.id != "672793821850894347") return

    const captcha = createCaptcha()

    const embed = new CustomEmbed(message.member, false, "please type the string sent to console")

    console.log(
        "--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---\n" +
        "captcha generated to reset economy\n" +
        captcha.display +
        "\n--- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---"
    )

    await message.channel.send(embed)

    const filter = (msg) => message.author.id == msg.author.id

    const response = await message.channel.awaitMessages(filter, {
        max: 1
    })

    if (response != captcha.answer) {
        return message.channel.send(new ErrorEmbed("captcha failed"))
    } else {
        const c = reset()

        return message.channel.send(new CustomEmbed(message.member, false, `${c.deleted} users deleted\n${c.updated}users updated`))
    }
}

cmd.setRun(run)

module.exports = cmd