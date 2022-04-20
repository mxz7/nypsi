const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("invite", "generate an invite link for the bot", categories.INFO).setAliases(["bot"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    const embed = new CustomEmbed(
        message.member,
        false,
        "bot invite: [invite.nypsi.xyz](http://invite.nypsi.xyz)\nsupport server: https://discord.gg/hJTDNST"
    )
        .setTitle("nypsi")
        .setFooter("made by max#0777 | tekoh.net")

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
