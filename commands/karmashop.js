const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isKarmaShopOpen } = require("../utils/karma/utils")

const cmd = new Command("karmashop", "buy stuff with your karma", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!isKarmaShopOpen()) {
        const embed = new CustomEmbed(message.member, false).setTitle("karma shop")
        embed.setDescription("the karma shop is currently closed ❌")
        return message.channel.send({embeds: [embed]})
    }
}

cmd.setRun(run)

module.exports = cmd
