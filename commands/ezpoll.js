const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map();

const cmd = new Command("ezpoll", "simple poll builder", categories.INFO)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        let time = 10 - diff

        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            time = 60 - diff
        }

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    if (args.length == 0) {

        const embed = new CustomEmbed(message.member)
            .setTitle("ezpoll help")
            .addField("usage", "$ezpoll <choices..>")
            .addField("help", "after creation your message will be deleted and an embed will be created to act as the poll\n" +
                "every word will be an option in the poll, with a maximum of 4 and minimum of two")
            .addField("example", "$poll option1 option2")

        return message.channel.send(embed)
    }

    if (args.length < 2) {
        return message.channel.send(new ErrorEmbed("not enough options"))
    }

    if (message.member.hasPermission("MANAGE_MESSAGES") && !message.member.hasPermission("ADMINISTRATOR")) {
        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);
    }

    if (!message.member.hasPermission("MANAGE_MESSAGES") && !message.member.hasPermission("ADMINISTRATOR")) {
        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 60000)
    }

    let choices = ""
    let count = 1

    for (option of args) {
        if (count > 4) break
            
        if (count == 1) {
            choices = "1️⃣ " + option
        } else if (count == 2) {
            choices = choices + "\n2️⃣ " + option
        } else if (count == 3) {
            choices = choices + "\n3️⃣ " + option
        } else if (count == 4) {
            choices = choices + "\n4️⃣ " + option
        }

        count++
    }

    const embed = new CustomEmbed(message.member, false, choices)
        .setTitle("poll by " + message.member.user.username)
        .setFooter("use $ezpoll to make a quick poll")
        .setDescription(choices)
    
    message.channel.send(embed).then(async m => {
        await message.delete().catch()
        
        if (args.length >= 2) {
            await m.react("1️⃣")
            await m.react("2️⃣")
        }

        if (args.length >= 3) await m.react("3️⃣")
        if (args.length >= 4) await m.react("4️⃣")
    })
}

cmd.setRun(run)

module.exports = cmd