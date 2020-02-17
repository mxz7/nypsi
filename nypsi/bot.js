/*jshint esversion: 6 */
const Discord = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const fs = require("fs");

client.commands = new Discord.Collection();
var aliases = new Discord.Collection();

const commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"));

console.log(" -- commands -- \n");
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    client.commands.set(command.name, command);

    console.log(command.name + " ✅");
}
console.log("\n -- commands -- ");

client.once("ready", () => {
    client.user.setPresence({
        status: "dnd"
    });

    aliases.set("ig", "instagram");
    aliases.set("av", "avatar");
    aliases.set("whois", "user");
    aliases.set("who", "user");

    console.log("\n\n- - -");
    console.log('nypsi is online..\n\n');
});



client.on("message", message => {

    if (!message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.substring(prefix.length).split(" ");
    let cmd = args[0].toLowerCase();

    if (aliases.get(cmd)) {
        runCommand(aliases.get(cmd), message, args);
        return logCommand(message, args);
    }

    if (client.commands.get(cmd)) {
        runCommand(cmd, message, args);
        return logCommand(message, args);
    }
    
});

client.login(token);

function logCommand(message, args) {
    args.shift();
    console.log(message.member.user.tag + " ran command '" + message.content.split(" ")[0] + "'" + " with args: '" + args.join(" ") + "'");
}

function runCommand(cmd, message, args) {
    client.commands.get(cmd).run(message, args);
}