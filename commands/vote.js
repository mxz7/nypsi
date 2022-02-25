const { Message } = require("discord.js")
const {
    hasVoted,
    getBalance,
    updateBalance,
    userExists,
    createUser,
    removeFromVoteCache,
    getPrestige,
    getMulti,
} = require("../utils/economy/utils.js")
const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()
const bonusCooldown = new Map()

const cmd = new Command(
    "vote",
    "vote every 12 hours to get an extra 10% bonus on gambling wins as well as a money reward",
    categories.MONEY
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!userExists(message.member)) createUser(message.member)

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    let prestige = getPrestige(message.author.id)

    if (prestige > 15) prestige = 15

    const prefix = getPrefix(message.guild)
    const amount = 15000 * (prestige + 1)
    const voted = hasVoted(message.member)
    const multi = Math.floor((await getMulti(message.member)) * 100)
    let crateAmount = Math.floor(prestige / 2 + 1)

    if (crateAmount > 5) crateAmount = 5

    const embed = new CustomEmbed(message.member, true, "https://top.gg/bot/678711738845102087/vote")
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setFooter("you get increased rewards for prestiging")

    if (voted) {
        embed.setTitle("vote ✅")
        embed.setColor("#5efb8f")
        embed.addField("rewards", `✓ +**10**% multiplier, total: **${multi}**%\n✓ +$**50k** max bet`)
    } else {
        embed.setTitle("vote ❌")
        embed.setColor("#e4334f")
        embed.addField(
            "rewards",
            `× +**10**% multiplier, current: **${multi}**%\n× +$**50k** max bet\n× $**${amount.toLocaleString()}** reward\n× **${crateAmount}** vote crate${
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
