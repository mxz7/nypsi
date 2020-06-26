const { MessageEmbed } = require("discord.js")

module.exports = {
    name: "reload",
    description: "reload commands",
    category: "none",
    permissions: ["bot owner"],
    run: async (message, args) => {
        if (message.member.user.id != "672793821850894347") return
        const { loadCommands, reloadCommand } = require("../utils/commandhandler")

        if (args.length == 0) {
            loadCommands()
            message.react("✅")
            console.log("\x1b[32m[" + getTimeStamp() + "] commands reloaded\x1b[37m")
        } else {

            let msg = reloadCommand(args).split("✔")
            msg = "```\n" + msg + "```"

            const embed = new MessageEmbed()
                .setTitle("reload")
                .setDescription(msg)
                .setFooter("bot.tekoh.wtf")
                .setColor("#60d16b")
            
            message.channel.send(embed)
        }
    }
}

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