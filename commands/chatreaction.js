const { Message } = require("discord.js")
const { createReactionProfile, hasReactionProfile, getWords, startReaction } = require("../chatreactions/utils")
const { getPrefix } = require("../guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("chatreaction", "see who can type the fastest", categories.FUN).setAliases(["cr", "reaction"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    
    if (!hasReactionProfile(message.guild)) createReactionProfile(message.guild)

    const helpCmd = () => {
        const embed = new CustomEmbed(message.member, true).setTitle("chat reactions | " + message.author.username)
        const prefix = getPrefix(message.guild)
        
        embed.setDescription(`${prefix}**cr start** *start a random chat reaction*\n` +
            `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
            `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
            `${prefix}**cr stats** *view the chat reaction stats for this server*`)
        
        return message.channel.send(embed)
    }

    if (args.length == 0) {
        return helpCmd()
    } else if (args[0].toLowerCase() == "start") {
        startReaction(message.guild, message.channel)
    }

}

cmd.setRun(run)

module.exports = cmd