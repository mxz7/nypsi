const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getColor } = require("../utils/utils")

const cmd = new Command("invite", "generate an invite link for the bot", categories.INFO).setAliases("bot")

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const color = getColor(message.member)

    const embed = new MessageEmbed()
        .setTitle("nypsi")
        .setDescription("bot invite: [bot.tekoh.wtf](http://bot.tekoh.wtf)\nsupport server: https://discord.gg/hJTDNST")
        .setColor(color)
        .setFooter("made by max#0777 | tekoh.wtf | racist.wtf")

    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd