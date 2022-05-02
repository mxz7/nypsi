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
import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
import { getPrefix } from "../utils/guilds/utils"
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("withdraw", "withdraw money from your bank", Categories.MONEY).setAliases(["with"])

cmd.slashEnabled = true
cmd.slashData.addIntegerOption((option) => option.setName("amount").setDescription("amount to withdraw").setRequired(true))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!userExists(message.member)) createUser(message.member)

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 10
        }
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("withdraw help")
            .addField("usage", `${prefix}withdraw <amount>`)
            .addField("help", "you can withdraw money from your bank aslong as you have that amount available in your bank")
        return send({ embeds: [embed] })
    }

    if (getBankBalance(message.member) == 0) {
        return send({ embeds: [new ErrorEmbed("you dont have any money in your bank account")] })
    }

    if (args[0].toLowerCase() == "all") {
        args[0] = getBankBalance(message.member)
    }

    if (args[0] == "half") {
        args[0] = getBankBalance(message.member) / 2
    }

    if (parseInt(args[0])) {
        args[0] = formatBet(args[0])
    } else {
        return send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    let amount = parseInt(args[0])

    if (amount > getBankBalance(message.member)) {
        return send({
            embeds: [new ErrorEmbed("you dont have enough money in your bank account")],
        })
    }

    if (!amount) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] })
    }

    if (amount <= 0) {
        return send({ embeds: [new ErrorEmbed("invalid payment")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const embed = new CustomEmbed(message.member, true)
        .setTitle("bank withdrawal | processing")
        .addField(
            "bank balance",
            "$**" +
                getBankBalance(message.member).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        )
        .addField("transaction amount", "-$**" + amount.toLocaleString() + "**")

    const m = await send({ embeds: [embed] })

    updateBankBalance(message.member, getBankBalance(message.member) - amount)
    updateBalance(message.member, getBalance(message.member) + amount)

    const embed1 = new CustomEmbed(message.member, true)
        .setTitle("bank withdrawal | success")
        .setColor("#5efb8f")
        .addField(
            "bank balance",
            "$**" +
                getBankBalance(message.member).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(message.member).toLocaleString() +
                "**"
        )

    embed1.addField("transaction amount", "-$**" + amount.toLocaleString() + "**")

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
