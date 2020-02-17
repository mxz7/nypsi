/*jshint esversion: 6 */
const Discord = require("discord.js");
const { RichEmbed } = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const fs = require("fs");

var commands = new Discord.Collection();
var aliases = new Discord.Collection();

const commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));

console.log(" -- commands -- \n");
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    commands.set(command.name, command);

    console.log(command.name + " ✅");
}
console.log("\n -- commands -- ");

client.once("ready", () => {
    client.user.setPresence({
        status: "dnd",
        game: {
            name: "tekoh.wtf | $help",
            type: "PLAYING"
        }
    });

    aliases.set("ig", "instagram");
    aliases.set("av", "avatar");
    aliases.set("whois", "user");
    aliases.set("who", "user");
    aliases.set("serverinfo", "server");
    aliases.set("ws", "wholesome");

    console.log("\n\n- - -");
    console.log('nypsi is online..\n\n');
});



client.on("message", message => {

    if (!message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.substring(prefix.length).split(" ");
    const cmd = args[0].toLowerCase();

    if (cmd == "help") {
        return helpCmd(message);
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
    args.shift();
    console.log(message.member.user.tag + " ran command '" + message.content.split(" ")[0] + "'" + " with args: '" + args.join(" ") + "'");
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

function helpCmd(message) {

    if (!message.guild.me.hasPermission("EMBED_LINKS")) {
        return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
    }

    let cmdMenu = "";

    for (let cmd of commands.keys()) {
        cmdMenu = (cmdMenu + "$**" + getCmdName(cmd) + "** " + getCmdDesc(cmd) + "\n");
    }

    let color;

        if (message.member.displayHexColor == "#000000") {
            color = "#FC4040";
        } else {
            color = message.member.displayHexColor;
        }

    const embed = new RichEmbed()
        .setTitle("help")
        .setColor(color)
        
        .addField("commands", cmdMenu)

        .setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
        .setTimestamp();

    message.channel.send(embed).catch(() => {
        return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
    });
}

client.login(token);