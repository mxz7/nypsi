const {
    getBalance,
    getBankBalance,
    getMaxBankBalance,
    updateBalance,
    updateBankBalance,
    userExists,
    createUser,
    formatBet,
} = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const { Command, Categories } = require("../utils/models/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("deposit", "deposit money into your bank", Categories.MONEY).setAliases(["dep"])

cmd.slashEnabled = true
cmd.slashData.addIntegerOption((option) => option.setName("amount").setDescription("amount to deposit").setRequired(true))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 10
        }
    }

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }

        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("deposit help")
            .addField("usage", `${prefix}deposit <amount>`)
            .addField(
                "help",
                "you can deposit money into your bank to keep it safe from robberies (and gambling if you have *issues*)\n" +
                    "however there is a limit to the size of your bank account, when starting, your bank has a capacity of $**15,000**, but will upgrade as your use the bot more."
            )
        return send({ embeds: [embed] })
    }

    if (args[0].toLowerCase() == "all") {
        args[0] = getBalance(message.member)
        const amount = parseInt(formatBet(args[0]))
        if (amount > getMaxBankBalance(message.member) - getBankBalance(message.member)) {
            args[0] = getMaxBankBalance(message.member) - getBankBalance(message.member)
        }
    }

    if (args[0] == "half") {
        args[0] = getBalance(message.member) / 2
    }

    if (parseInt(args[0])) {
        args[0] = formatBet(args[0])
    } else {
        return send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    const amount = parseInt(args[0])

    if (amount > getBalance(message.member)) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] })
    }

    if (amount > getMaxBankBalance(message.member) - getBankBalance(message.member)) {
        return send({ embeds: [new ErrorEmbed("your bank is not big enough for this payment")] })
    }

    if (amount <= 0) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const embed = new CustomEmbed(message.member, false)
        .setTitle("bank deposit | processing")
        .addField(
            "bank balance",
            "$**" +
                getBankBalance(message.member).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        )
        .addField("transaction amount", "+$**" + amount.toLocaleString() + "**")

    const m = await send({ embeds: [embed] })

    updateBalance(message.member, getBalance(message.member) - amount)
    updateBankBalance(message.member, getBankBalance(message.member) + amount)

    const embed1 = new CustomEmbed(message.member, false)
        .setTitle("bank deposit | success")
        .setColor("#5efb8f")
        .addField(
            "bank balance",
            "$**" +
                getBankBalance(message.member).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        )
        .addField("transaction amount", "+$**" + amount.toLocaleString() + "**")

    const edit = async (data, msg) => {
        if (message.interaction) {
            await message.editReply(data)
            return await message.fetchReply()
        } else {
            return await msg.edit(data)
        }
    }

    setTimeout(() => edit({ embeds: [embed1] }, m), 1500)
}

cmd.setRun(run)

module.exports = cmd
