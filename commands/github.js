const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("github", "view code for the bot on github", categories.INFO).setAliases(["git"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const embed = new CustomEmbed(message.member, true, "this bot is opensource and you can view/use the code for completely free\n" +
        "click [here](https://github.com/tekohxd/nypsi) to view the source code on github")
        .setTitle("github")
        .setURL("https://github.com/tekohxd/nypsi")
    
    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd