const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("github", "view code for the bot on github", categories.INFO).setAliases(["git"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const embed = new CustomEmbed(
        message.member,
        true,
        "nypsi is open source!!\n" + "click [here](https://github.com/tekoh/nypsi) to view the source code on github"
    )
        .setTitle("github")
        .setURL("https://github.com/tekoh/nypsi")
        .addField(
            "what does this mean?",
            "if you know how to code, you could fix bugs, add features, create your own commands.. the list goes on."
        )

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
