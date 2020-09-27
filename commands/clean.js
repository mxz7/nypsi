const { getPrefix } = require("../guilds/utils");
const { Command, categories } = require("../utils/classes/Command");

const cooldown = new Map();

const cmd = new Command("clean", "clean up bot commands and responses", categories.MODERATION)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("MANAGE_MESSAGES")) return

    if (!message.guild.me.hasPermission("MANAGE_MESSAGES")) {
        return message.channel.send("❌ i am lacking permission: 'MANAGE_MESSAGES'");
    }

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
        return message.channel.send("❌ still on cooldown for " + remaining);
    }

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 15000);

    const prefix = getPrefix(message.guild)

    const collected = await message.channel.messages.fetch({limit: 50})

    const collecteda = collected.filter(msg => msg.author.id == message.client.user.id || msg.content.startsWith(prefix))

    await message.channel.bulkDelete(collecteda)

}

cmd.setRun(run)

module.exports = cmd