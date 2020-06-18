const { table, getBorderCharacters } = require("table")
const { updateXp, getXp, userExists } = require("../economy/utils.js")
const { aliases } = require("../nypsi")
const { list } = require("../optout.json");
const fs = require("fs")

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

    let fun = []
    let info = []
    let money = []
    let moderation = []
    let nsfw = []

    for (cmd of commands.keys()) {

        if (getCmdCategory(cmd) == "fun") {
            fun.push(cmd)
        }
        if (getCmdCategory(cmd) == "info") {
            info.push(cmd)
        }
        if (getCmdCategory(cmd) == "money") {
            money.push(cmd)}

        if (getCmdCategory(cmd) == "moderation") {
            moderation.push(cmd)
        }

        if (getCmdCategory(cmd) == "nsfw") {
            nsfw.push(cmd)
        }
    }

    let color;

    if (message.member.displayHexColor == "#000000") {
        color = "#FC4040";
    } else {
        color = message.member.displayHexColor;
    }

    if (args.length == 0 && args[0] != "fun" && args[0] != "info" && args[0] != "money" && args[0] != "mod" && args[0] != aliases) {

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("fun", "$**help** fun", true)
            .addField("info", "$**help** info", true)
            .addField("money", "$**help** money", true)
            .addField("mod", "$**help** mod", true)
            .addField("nsfw", "$**help** nsfw", true)
            .addField("aliases", "$**help** aliases", true)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }

    if (args[0] == "fun") {

        let cmdList = ""

        for (command of fun) {
            cmdList = cmdList + "$**" + getCmdName(command) + "** " + getCmdDesc(command) + "\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("fun commands", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }

    if (args[0] == "info") {

        let cmdList = ""

        for (command of info) {
            cmdList = cmdList + "$**" + getCmdName(command) + "** " + getCmdDesc(command) + "\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("info commands", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf");
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }

    if (args[0] == "money") {

        let cmdList = ""

        for (command of money) {
            cmdList = cmdList + "$**" + getCmdName(command) + "** " + getCmdDesc(command) + "\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("money commands", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }

    if (args[0] == "mod") {

        let cmdList = ""

        for (command of moderation) {
            cmdList = cmdList + "$**" + getCmdName(command) + "** " + getCmdDesc(command) + "\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("mod commands", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }

    if (args[0] == "aliases") {
        cmdList = ""

        for (cmd of aliases.sort().keys()) {
            cmdList = cmdList + "$**" + cmd + "** -> $**" + aliases.get(cmd) + "**\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("aliases", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
    }
    
    if (args[0] == "nsfw") {

        let cmdList = ""

        for (command of nsfw) {
            cmdList = cmdList + "$**" + getCmdName(command) + "** " + getCmdDesc(command) + "\n"
        }

        const embed = new MessageEmbed()
            .setTitle("help")
            .setColor(color)
        
            .addField("nsfw commands", cmdList)

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        });
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