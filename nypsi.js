const Discord = require("discord.js");
const { MessageEmbed } = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const fs = require("fs");
const { list } = require("./optout.json");
const ascii = require("figlet");
const { banned } = require("./banned.json");
const { getUserCount } = require("./utils.js")
const { runCheck, hasGuild, createGuild } = require("./guilds/utils.js")

const commands = new Discord.Collection();
const aliases = new Discord.Collection();
const cooldown = new Set()
const snipe = new Map()
let cmdCount = 0
let ready = false

let commandFiles 

function loadCommands() {
    commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));

    if (commands.size > 0) {
        for (command of commands.keyArray()) {
            delete require.cache[require.resolve(`./commands/${command}.js`)]
        }
        commands.clear()
    }

    for (file of commandFiles) {
        let command
        
        try {
            command = require(`./commands/${file}`);

            let enabled = true;
        
            if (!command.name || !command.description || !command.run || !command.category) {
                enabled = false;
            }

            if (enabled) {
                commands.set(command.name, command);
                console.log(command.name + " ✅");
            } else {
                console.log(file + " ❌");
            }
        } catch (e) {
            console.log(" - - - - - - - - - - ")
            console.log(file + " ❌");
            console.log("type $reload " + file + " to view error")
            console.log(" - - - - - - - - - - ")
        }

        
    }
}
exports.reloadCommands = loadCommands

console.log(" -- commands -- \n");

loadCommands()

aliases.set("ig", "instagram");
aliases.set("av", "avatar");
aliases.set("whois", "user");
aliases.set("who", "user");
aliases.set("serverinfo", "server");
aliases.set("ws", "wholesome");
aliases.set("rick", "rickroll");
aliases.set("git", "github");
aliases.set("bal", "balance");
aliases.set("top", "baltop")
aliases.set("cf", "coinflip")
aliases.set("r", "roulette")
aliases.set("steal", "rob")
aliases.set("rps", "rockpaperscissors")
aliases.set("mc", "minecraft")
aliases.set("bunny", "rabbit")
aliases.set("lock", "lockdown")
aliases.set("ch", "channel")
aliases.set("colour", "color")
aliases.set("activity", "presence")
aliases.set("purge", "delete")

console.log("\n -- commands -- ");

client.once("ready", async () => {

    setTimeout(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: "tekoh.wtf | $help | " + client.guilds.cache.size
            }
        });
    }, 5000)

    setInterval(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: "tekoh.wtf | $help | " + client.guilds.cache.size
            }
        })
    }, 600000)

    console.log("\nserver count: " + client.guilds.cache.size)
    console.log("commands count: " + commands.size)
    console.log("users in memory: " + getUserCount())
    console.log("\n- - -\n");

    ascii("n y p s i", function(err, data) {
        if (!err) {
            console.log(data);
            console.log("\n\nlogged in as " + client.user.tag + " @ " + getTimeStamp() + "\n");
            console.log("- - -\n\n")
        }
    });
});

client.on("guildCreate", guild => {
    console.log("\x1b[36m[" + getTimeStamp() + "] joined new server '" + guild.name + "' new count: " + client.guilds.cache.size + "\x1b[37m")
    if (!hasGuild(guild)) {
        createGuild(guild)
    }
})

client.on("guildDelete", guild => {
    console.log("\x1b[36m[" + getTimeStamp() + "] removed from server '" + guild.name + "' new count: " + client.guilds.cache.size + "\x1b[37m")
})

client.on("rateLimit", () => {
    console.log("\x1b[31m[" + getTimeStamp() + "] BEING RATE LIMITED!!\x1b[37m")
})

client.on("messageDelete", message => {

    if (message.content != "" && !message.member.user.bot) {
        snipe.set(message.channel.id, message)

        exports.snipe = snipe
    }
})

client.on("message", message => {

    if (softLock(message) && message.content.length > 250) {
        message.delete().catch()
    }

    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    if (!ready) {
        return message.channel.send("❌\nplease wait before using commands")
    }

    if (banned.includes(message.member.user.id)) {
        cooldown.add(message.member.user.id)

        setTimeout(() => {
            cooldown.delete(message.member.user.id)
        }, 10000)
        return message.channel.send("❌\nyou are banned from this bot").then(m => m.delete({ timeout: 2500}));
    }

    if (cooldown.has(message.member.user.id)) {
        return
    }

    cooldown.add(message.member.user.id)

    setTimeout(() => {
        cooldown.delete(message.member.user.id)
    }, 500)

    const args = message.content.substring(prefix.length).toLowerCase().split(" ");

    const cmd = args[0].toLowerCase();

    if (cmd == "help") {
        logCommand(message, args);
        return helpCmd(message, args);
    }

    if (aliases.get(cmd)) {
        logCommand(message, args);
        return runCommand(aliases.get(cmd), message, args);
    }

    if (commands.get(cmd)) {
        logCommand(message, args);
        return runCommand(cmd, message, args);
    }
    
});

function logCommand(message, args) {
    cmdCount++
    exports.cmdCount = cmdCount
    args.shift();

    const server = message.guild.name

    console.log("[" + getTimeStamp() + "] " + message.member.user.tag + " -> '" + message.content.split(" ")[0] + "'" + " -> '" + args.join(" ") + "' -> '" + server + "'");
}

function softLock(message) {
    const role = message.guild.roles.cache.find(role => role.name == "@everyone")

    const a = message.channel.permissionOverwrites.get(role.id)

    if (!a) {
        locked = false
    } else if (!a.deny) {
        locked = false
    } else if (!a.deny.bitfield) {
        locked = false
    } else {
        const b = new Discord.Permissions(a.deny.bitfield).toArray()
        if (b.includes("EMBED_LINKS") && b.includes("ATTACH_FILES")) {
            locked = true
        }
    }
    return locked
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

function runCommand(cmd, message, args) {
    commands.get(cmd).run(message, args);
    
}

function getCmdName(cmd) {
    return commands.get(cmd).name;
}

function getCmdDesc(cmd) {
    return commands.get(cmd).description;
}

function getCmdCategory(cmd) {
    return commands.get(cmd).category;
}

function helpCmd(message, args) {
    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
    }

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
        
            .addField("fun", "$**help** fun")
            .addField("info", "$**help** info")
            .addField("money", "$**help** money")
            .addField("mod", "$**help** mod")
            .addField("nsfw", "$**help** nsfw")
            .addField("aliases", "$**help** aliases")

            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")
        
        if (!list.includes(message.member.user.id)) {
            return message.member.send(embed).then( () => {
                message.react("✅");
            }).catch( () => {
                message.channel.send(embed).catch(() => {
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
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
                    return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
                   });
            });
        }
        
        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        });
    }

}

function reloadCommand(command) {
    commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));
    try {
        commands.delete(command)
        try {
            delete require.cache[require.resolve(`./commands/${command}`)]
        } catch (e) {}
        
        const commandData = require(`./commands/${command}`);
    
        let enabled = true;
        
        if (!commandData.name || !commandData.description || !commandData.run || !commandData.category) {
            enabled = false;
        }
        
        if (enabled) {
            commands.set(commandData.name, commandData);
            console.log(commandData.name + " ✅");
            return true
        } else {
            console.log(command + " ❌");
            return false
        }
    } catch (e) {
        console.log(e)
        return false
    }
}

exports.cmdCount = cmdCount
exports.commandsSize = commands.size
exports.aliasesSize = aliases.size
exports.snipe
exports.reloadCommand = reloadCommand

client.login(token).then(() => {
    setTimeout(() => {
        ready = true
        runChecks()
    }, 2000)
})

function runChecks() {
    setInterval(() => {
        client.guilds.cache.forEach(guild => {
            if (!hasGuild(guild)) {
                createGuild(guild)
            } else {
                runCheck(guild)
            }
        })
    }, 45000)
}