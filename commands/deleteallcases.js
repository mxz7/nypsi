const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js");
const { deleteServer, profileExists } = require("../moderation/utils");
const { Command, categories } = require("../utils/classes/Command");

const cmd = new Command("deleteallcases", "delete all cases in a server", categories.MODERATION).setAliases(["dac"]).setPermissions(["server owner"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const color = getColor(message.member)

    if (!message.member.hasPermission("MANAGE_MESSAGES")) return

    if (message.member.hasPermission("MANAGE_MESSAGES") && message.guild.owner.user.id != message.member.user.id) {
        const embed = new MessageEmbed()
            .setTitle("deleting all cases")
            .setDescription("❌ to delete all cases you must be the server owner")
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        return message.channel.send(embed)
    }

    if (!profileExists(message.guild)) return await message.channel.send("❌ there are no cases to delete")

    const embed = new MessageEmbed()
        .setTitle("confirmation")
        .setColor(color)
        .setDescription("react with ✅ to delete all punishment/moderation cases")
        .setFooter("this cannot be reversed")

    const msg = await message.channel.send(embed)

    await msg.react("✅")

    const filter = (reaction, user) => {
        return ["✅"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const reaction = await msg.awaitReactions(filter, { max: 1, time: 15000, errors: ["time"] })
        .then(collected => {
            return collected.first().emoji.name
        }).catch(async () => {
            await msg.reactions.removeAll()
        })

    if (reaction == "✅") {
        deleteServer(message.guild)

        const newEmbed = new MessageEmbed()
            .setDescription("✅ all cases have been deleted")
            .setColor(color)

        await msg.edit(newEmbed)
    }

}

cmd.setRun(run)

module.exports = cmd