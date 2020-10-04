const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getDMsEnabled, setDMsEnabled, userExists, createUser } = require("../economy/utils");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders");

const cmd = new Command("dms", "enable/disable dms with the bot", categories.INFO).setAliases(["optout", "optin"])

const cooldown = new Map()

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 30 - diff

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

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 30000);

    if (!userExists(message.member)) createUser(message.member)

    const current = getDMsEnabled(message.member)

    let newValue
    let embed

    if (current) {
        newValue = false
        embed = new CustomEmbed(message.member, false, "✅ you will no longer receive dms from nypsi")
    } else {
        newValue = true
        embed = new CustomEmbed(message.member, false, "✅ you will now receive dms from nypsi")
    }

    setDMsEnabled(message.member, newValue)

    return await message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd