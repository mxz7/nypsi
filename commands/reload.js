const { MessageEmbed } = require("discord.js")

module.exports = {
    name: "reload",
    description: "reload commands",
    category: "none",
    run: async (message, args) => {
        const { reloadCommands, reloadCommand } = require("../nypsi.js")
        if (message.member.user.id != "672793821850894347") return

        if (args.length == 0) {
            console.log(" -- commands -- \n");
            reloadCommands()
            console.log("\n -- commands -- \n");
    
            message.react("✅")
            console.log("\x1b[32m[" + getTimeStamp() + "] commands reloaded\x1b[37m")
        } else {

            let msg = ""

            console.log(" - - - ")

            for (arg of args) {
                if (!reloadCommand(arg)) {
                    msg = msg + "\n**" + arg + "** ❌"
                } else {
                    msg = msg + "\n**" + arg + "** ✅"
                }
            }

            console.log(" - - - ")

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