module.exports = {
    name: "reload",
    description: "reload all commands",
    category: "none",
    run: async (message, args) => {
        const { reloadCommands, reloadCommand } = require("../nypsi.js")
        if (message.member.user.id != "672793821850894347") return

        if (args.length == 0) {
            console.log(" -- commands -- \n");
            reloadCommands()
            console.log("\n -- commands -- \n");
    
            console.log("\x1b[32m[" + getTimeStamp() + "] commands reloaded\x1b[37m")
        } else {
            if (!reloadCommand(args[0])) {
                return message.react("❌")
            }
        }


        
        message.react("✅")
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