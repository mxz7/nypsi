const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { CustomEmbed } = require("../utils/classes/EmbedBuilders");

const cmd = new Command("support", "join the nypsi support server", categories.INFO)


/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    return message.channel.send("discord.gg/hJTDNST")
}

cmd.setRun(run)

module.exports = cmd