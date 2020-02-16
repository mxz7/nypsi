/*jshint esversion: 6 */
const Discord = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const fs = require("fs");

client.commands = new Discord.Collection();

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

    console.log("- - -");
    console.log('nypsi is online..\n\n');
});



client.on("message", message => {

    if (!message.guild) return;
    if (!message.content.startsWith(`${prefix}`)) return;

    const args = message.content.substring(prefix.length).split(" ");
    const cmd = args[0].toLowerCase();

    if (cmd == "ig") {
        client.commands.get("instagram").run(message, args);

        return console.log(message.member.user.tag + " ran command '" + cmd + "'");
    }

    if (client.commands.get(cmd)) {
        client.commands.get(cmd).run(message, args);

        return console.log(message.member.user.tag + " ran command '" + cmd + "'");
    }
});

client.login(token);