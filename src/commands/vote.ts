import { CommandInteraction, Message } from "discord.js"
import { hasVoted, userExists, createUser, removeFromVoteCache, getPrestige, getMulti } from "../utils/economy/utils.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders.js"

const cmd = new Command(
    "vote",
    "vote every 12 hours to get an extra 5% bonus on gambling wins as well as a money reward",
    Categories.MONEY
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!userExists(message.member)) createUser(message.member)

    let prestige = getPrestige(message.author.id)

    if (prestige > 15) prestige = 15

    const amount = 15000 * (prestige + 1)
    const voted = hasVoted(message.member)
    const multi = Math.floor(getMulti(message.member)) * 100
    let crateAmount = Math.floor(prestige / 2 + 1)

    if (crateAmount > 5) crateAmount = 5

    const embed = new CustomEmbed(message.member, true, "https://top.gg/bot/678711738845102087/vote")
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setFooter("you get increased rewards for prestiging")

    if (voted) {
        embed.setHeader("vote ✅", message.author.avatarURL())
        embed.setColor("#5efb8f")
        embed.addField("active rewards", `✓ +**3**% multiplier, total: **${multi}**%\n✓ +$**50k** max bet`)
    } else {
        embed.setHeader("vote ❌", message.author.avatarURL())
        embed.setColor("#e4334f")
        embed.addField(
            "rewards",
            `× +**3**% multiplier, current: **${multi}**%\n× +$**50k** max bet\n× $**${amount.toLocaleString()}** reward\n× **10** karma\n× **${crateAmount}** vote crate${
                crateAmount > 1 ? "s" : ""
            }`
        )
        embed.setFooter("you get increased rewards for prestiging")
        removeFromVoteCache(message.member)
    }

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
