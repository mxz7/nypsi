const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("reload", "reload commands", categories.NONE)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (message.member.user.id != "672793821850894347") return
    const { loadCommands, reloadCommand } = require("../utils/commandhandler")

    if (args.length == 0) {
        loadCommands()
        message.react("✅")
        console.log("\x1b[32m[" + getTimeStamp() + "] commands reloaded\x1b[37m")
    } else {

        let msg

        try {
            msg = reloadCommand(args).split("✔")
            msg = "```\n" + msg + "```"
        } catch (e) {
            return message.channel.send(new ErrorEmbed(`\`\`\`${e}\`\`\``))
        }

        const embed = new CustomEmbed(message.member, false, msg)
            .setTitle("reload")
        
        message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd

function getTimeStamp() {
    const date = new Date();
    let hours = date.getHours().toString();
    let minutes = date.getMinutes().toString();
    let seconds = date.getSeconds().toString();

    if (hours.length == 1) {
        hours = "0" + hours;
    } 

    if (minutes.length == 1) {
        minutes = "0" + minutes;
    } 

    if (seconds.length == 1) {
        seconds = "0" + seconds;
    }

    const timestamp = hours + ":" + minutes + ":" + seconds;

    return timestamp
}