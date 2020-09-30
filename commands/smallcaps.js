const smallCaps = require('smallcaps');
const { Message } = require("discord.js");
const { Command, categories } = require('../utils/classes/Command');
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("smallcaps", "convert any text to small caps", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed("$smallcaps <text>"));
    }

    const string = args.join(" ").toLowerCase()

    message.channel.send(new CustomEmbed(message.member, false, `\`\`\`${smallCaps(string.toString())}\`\`\``));

}

cmd.setRun(run)

module.exports = cmd