const { list } = require("../optout.json");
const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");

const cooldown = new Set();

const cmd = new Command("optin", "optin to start receiving dms again", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        message.delete().catch();
        return message.channel.send("❌ still on cooldown")
    }

    cooldown.add(message.member.id);

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 10000);

    if (!list.includes(message.member.user.id)) {
        return message.channel.send("❌ you are already opted into bot dms - use $optout to opt out");
    }

    const index = list.indexOf(message.member.user.id);

    if (index > -1) {
        list.splice(index, 1);
    }

    let value = {
        "list": list
    };

    const fs = require("fs");
    jsonData = JSON.stringify(value);

    fs.writeFileSync("./optout.json", jsonData, function(err) {
        if (err) console.log(err);
    });

    message.channel.send("✅ you will now recieve bot dms");
}

cmd.setRun(run)

module.exports = cmd