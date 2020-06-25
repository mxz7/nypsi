const { table, getBorderCharacters } = require("table")
const { updateXp, getXp, userExists } = require("../economy/utils.js")
const { getColor } = require("./utils")
const { list } = require("../optout.json");
const fs = require("fs");
const { MessageEmbed } = require("discord.js");

const commands = new Map();
const xpCooldown = new Set()
const cooldown = new Set()

function loadCommands() {
    console.log("loading commands..")
    const startTime = new Date().getTime()

    const commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));
    const failedTable = []

    if (commands.size > 0) {
        for (command of commands.keys()) {
            delete require.cache[require.resolve(`../commands/${command}.js`)]
        }
        commands.clear()
    }

    for (file of commandFiles) {
        let command
        
        try {
            command = require(`../commands/${file}`);

            let enabled = true;
        
            if (!command.name || !command.description || !command.run || !command.category) {
                enabled = false;
            }

            if (enabled) {
                commands.set(command.name, command);
            } else {
                failedTable.push([file, "❌"])
                console.log(file + " missing name, description, category or run")
            }
        } catch (e) {
            failedTable.push([file, "❌"])
            console.log(e)
        }
    }

    const endTime = new Date().getTime()
    const timeTaken = endTime - startTime

    if (failedTable.length != 0) {
        console.log(table(failedTable, {border: getBorderCharacters("ramac")}))
    } else {
        console.log("all commands loaded without error ✅")
    }

    console.log("time taken: " + timeTaken + "ms")
    exports.commandsSize = commands.size
}

function reloadCommand(commandsArray) {
    const reloadTable = []

    for (cmd of commandsArray) {
        try {
            commands.delete(cmd)
            try {
                delete require.cache[require.resolve(`../commands/${cmd}`)]
            } catch (e) {
                return console.log("error deleting from cache")
            }
            
            const commandData = require(`../commands/${cmd}`);
        
            let enabled = true;
            
            if (!commandData.name || !commandData.description || !commandData.run || !commandData.category) {
                enabled = false;
            }
            
            if (enabled) {
                commands.set(commandData.name, commandData);
                reloadTable.push([commandData.name, "✅"])
                exports.commandsSize = commands.size
            } else {
                reloadTable.push([cmd, "❌"])
                exports.commandsSize = commands.size
            }
        } catch (e) {
            reloadTable.push([cmd, "❌"])
            console.log(e)
        }
    }
    exports.commandsSize = commands.size
    console.log(table(reloadTable, {border: getBorderCharacters("ramac")}))
    return table(reloadTable, {border: getBorderCharacters("ramac")})
}

function helpCmd(message, args) {
    logCommand(message, args);

    const helpCategories = new Map()

    for (cmd of commands.keys()) {
        const category = getCmdCategory(cmd)

        if (helpCategories.has(category)) {
            const current = helpCategories.get(category)

            current.push("$**" + getCmdName(cmd) + "** *" + getCmdDesc(cmd) + "*")
            helpCategories.set(category, current)
        } else {
            helpCategories.set(category, ["$**" + getCmdName(cmd) + "** *" + getCmdDesc(cmd) + "*"])
        }
    }
    
    const { aliases } = require("../nypsi")

    for (cmd of aliases.sort().keys()) {
        if (helpCategories.has("aliases")) {
            const current = helpCategories.get("aliases")

            current.push("$**" + cmd + "** -> $**" + aliases.get(cmd) + "**")
            helpCategories.set("aliases", current)
        } else {
            helpCategories.set("aliases", ["$**" + cmd + "** -> $**" + aliases.get(cmd) + "**"])
        }
    }

    const color = getColor(message.member)

    const embed = new MessageEmbed()
        .setTitle("help")
        .setColor(color)
        .setFooter("bot.tekoh.wtf | created by max#0777")


    /**
     * FINDING WHAT THE USER REQUESTED
     */
    
    if (args[0].toLowerCase() == "mod") args[0] = "moderation"

    if (args.length == 0 || !helpCategories.has(args[0].toLowerCase())) {
        embed.addField("fun", "$**help** fun", true)
        embed.addField("info", "$**help** info", true)
        embed.addField("money", "$**help** money", true)
        embed.addField("mod", "$**help** mod", true)
        embed.addField("nsfw", "$**help** nsfw", true)
        embed.addField("aliases", "$**help** aliases", true)
    } else {
        embed.addField(args[0].toLowerCase() + " commands", helpCategories.get(args[0].toLowerCase()).join("\n"))
    }


    /**
     *  SENDING MESSAGE
     */

    if (!list.includes(message.member.user.id)) {
        return message.member.send(embed).then( () => {
            return message.react("✅");
        }).catch( () => {
            return message.channel.send(embed).catch(() => {
                return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
               });
        });
    } else {
        return message.channel.send(embed)
    }
}

function runCommand(cmd, message, args) {
    if (!commandExists(cmd)) return

    if (cooldown.has(message.member.user.id)) return

    cooldown.add(message.member.user.id)

    setTimeout(() => {
        cooldown.delete(message.member.user.id)
    }, 500)

    if (!message.guild.me.hasPermission("SEND_MESSAGES")) return

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ i am lacking permission `EMBED_LINKS`")
    }

    if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
        return message.channel.send("❌ i am lacking permission `MANAGE_MESSAGES`")
    }

    try {
        logCommand(message, args)
        commands.get(cmd).run(message, args)
    } catch(e) {
        console.log(e)
    }

    try {
        if (!message.member) return
        if (!userExists(message.member)) return
    
        setTimeout(() => {
            try {
                if (!xpCooldown.has(message.member.user.id)) {
                    updateXp(message.member, getXp(message.member) + 1)
            
                    xpCooldown.add(message.member.user.id)
            
                    setTimeout(() => {
                        try {
                            xpCooldown.delete(message.member.user.id)
                        } catch {}
                    }, 90000)
                }
            } catch {}
        }, 10000)
    } catch {}
}

function commandExists(cmd) {
    if (commands.has(cmd)) {
        return true
    } else {
        return false
    }
}

exports.helpCmd = helpCmd
exports.loadCommands = loadCommands
exports.reloadCommand = reloadCommand
exports.runCommand = runCommand
exports.commandExists = commandExists

function getCmdName(cmd) {
    return commands.get(cmd).name;
}

function getCmdDesc(cmd) {
    return commands.get(cmd).description;
}

function getCmdCategory(cmd) {
    return commands.get(cmd).category;
}

function logCommand(message, args) {
    args.shift();

    const server = message.guild.name

    console.log("\x1b[33m[" + getTimeStamp() + "] " + message.member.user.tag + ": '" + message.content + "' ~ '" + server + "'\x1b[37m");
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