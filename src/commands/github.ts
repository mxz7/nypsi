const { Message } = require("discord.js")
const { Command, Categories } = require("../utils/models/Command")
const { CustomEmbed } = require("../utils/models/EmbedBuilders.js")

const cmd = new Command("github", "view code for the bot on github", Categories.INFO).setAliases(["git"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
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
