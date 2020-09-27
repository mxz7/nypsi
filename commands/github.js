const { MessageEmbed, Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");

const { getColor } = require("../utils/utils")

const cmd = new Command("github", "view code for the bot on github", categories.INFO).setAliases(["git"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
    }

    const color = getColor(message.member);

    const embed = new MessageEmbed()
        .setColor(color)
        .setTitle("github")
        .setURL("https://github.com/tekohxd/nypsi")
        .setDescription("this bot is opensource and you can view/use the code for completely free\n" +
        "click [here](https://github.com/tekohxd/nypsi) to view the source code on github")
        
        .setFooter("bot.tekoh.wtf")
    

    message.channel.send(embed).catch(() => {
        return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
    });

}

cmd.setRun(run)

module.exports = cmd