import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
const {
    getItems,
    getInventory,
    setInventory,
    userExists,
    createUser,
    hasPadlock,
    setPadlock,
    getDMsEnabled,
    addItemUse,
    openCrate,
} = require("../utils/economy/utils")
import { getPrefix } from "../utils/guilds/utils"
const { isPremium, getTier } = require("../utils/premium/utils")
import { getMember } from "../utils/utils"
const { onBankRobCooldown, deleteBankRobCooldown } = require("./bankrob")
const { onStoreRobCooldown, deleteStoreRobCooldown } = require("./storerob")

const cmd = new Command("use", "use an item or open crates", Categories.MONEY).setAliases(["open"])

cmd.slashEnabled = true
cmd.slashData.addStringOption((option) =>
    option
        .setName("item")
        .setDescription("the item you want to use")
        .setRequired(true)
        .addChoice("📦 vote", "vote")
        .addChoice("📦 basic", "basic")
        .addChoice("🔒 padlock", "padlock")
        .addChoice("🧰 lock pick", "lock_pick")
        .addChoice("😷 mask", "mask")
        .addChoice("📻 radio", "radio")
        .addChoice("handcuffs", "handcuffs")
        .addChoice("chastity_cage", "chastity_cage")
)

const cooldown = new Map()

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
        const init = cooldown.get(message.member.id).init
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldown.get(message.member.id).length - diff

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

    if (args.length == 0) {
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `${getPrefix(message.guild)}use <item>\n\nuse items to open crates or to simply use the item's function`
                ).setTitle("use | " + message.author.username),
            ],
        })
    }

    const items = getItems()
    const inventory = getInventory(message.member)

    let searchTag = args[0].toLowerCase()

    let selected

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : []
        if (searchTag == itemName) {
            selected = itemName
            break
        } else if (searchTag == itemName.split("_").join("")) {
            selected = itemName
            break
        } else if (aliases.indexOf(searchTag) != -1) {
            selected = itemName
            break
        }
    }

    selected = items[selected]

    if (!selected) {
        return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] })
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] })
    }

    if (selected.role == "car") {
        return send({
            embeds: [new ErrorEmbed(`cars are used for street races (${getPrefix(message.guild)}sr)`)],
        })
    }

    if (selected.role != "item" && selected.role != "tool" && selected.role != "crate") {
        return send({ embeds: [new ErrorEmbed("you cannot use this item")] })
    }

    if (selected.role == "crate") {
        cooldownLength = 5
    }

    cooldown.set(message.member.id, {
        init: new Date(),
        length: cooldownLength,
    })

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (selected.id.includes("gun")) {
        return send({
            embeds: [new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}hunt`)],
        })
    } else if (selected.id.includes("fishing")) {
        return send({
            embeds: [new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}fish`)],
        })
    } else if (selected.id.includes("coin")) {
        return send({ embeds: [new ErrorEmbed("you cant use a coin 🙄")] })
    } else if (selected.id.includes("pickaxe")) {
        return send({ embeds: [new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}mine`)] })
    } else if (selected.id.includes("furnace")) {
        return send({ embeds: [new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}smelt`)] })
    }

    const embed = new CustomEmbed(message.member).setTitle("use | " + message.author.username)

    let laterDescription

    if (selected.role == "crate") {
        addItemUse(message.member, selected.id)
        const itemsFound = openCrate(message.member, selected)

        embed.setDescription(`opening ${selected.emoji} ${selected.name}...`)

        laterDescription = `opening ${selected.emoji} ${selected.name}...\n\nyou found: \n - ${itemsFound.join("\n - ")}`
    } else {
        const { onRadioCooldown, addRadioCooldown, onRobCooldown, deleteRobCooldown } = require("./rob")
        const { onChastityCooldown, addChastityCooldown, deleteChastityCooldown } = require("./sex")
        const { isHandcuffed, addHandcuffs } = require("../utils/commandhandler")

        switch (selected.id) {
            case "standard_watch":
                addItemUse(message.member, selected.id)
                embed.setDescription("you look down at your watch to check the time..")
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`
                break

            case "golden_watch":
                addItemUse(message.member, selected.id)
                embed.setDescription("you look down at your *golden* 😏 watch to check the time..")
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`
                break

            case "diamond_watch":
                addItemUse(message.member, selected.id)
                embed.setDescription("you look down at your 💎 *diamond* 💎 watch to check the time..")
                laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`
                break

            case "calendar":
                addItemUse(message.member, selected.id)
                embed.setDescription("you look at your calendar to check the date..")
                laterDescription = `you look at your calendar to check the date..\n\nit's ${new Date().toDateString()}`
                break

            case "padlock":
                if (hasPadlock(message.member)) {
                    return send({
                        embeds: [new ErrorEmbed("you already have a padlock on your balance")],
                    })
                }

                setPadlock(message.member, true)
                inventory["padlock"]--

                if (inventory["padlock"] <= 0) {
                    delete inventory["padlock"]
                }

                setInventory(message.member, inventory)

                addItemUse(message.member, selected.id)

                embed.setDescription("✅ your padlock has been applied")
                break

            case "lawyer":
                embed.setDescription("lawyers will be used automatically when you rob someone")
                break

            case "lock_pick":
                if (message.guild.id == "747056029795221513") {
                    return send({ embeds: [new ErrorEmbed("this has been disabled in the support server")] })
                }

                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${getPrefix(message.guild)}use lockpick <member>`)],
                    })
                }

                let lockPickTarget // eslint-disable-line

                if (!message.mentions.members.first()) {
                    lockPickTarget = await getMember(message, args[1])
                } else {
                    lockPickTarget = message.mentions.members.first()
                }

                if (!lockPickTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (message.member == lockPickTarget) {
                    if (onChastityCooldown(message.author.id)) {
                        addItemUse(message.member, selected.id)
                        deleteChastityCooldown(message.author.id)

                        embed.setDescription("picking chastity cage...")
                        laterDescription = "picking *chastity cage*...\n\nyou are no longer equipped with a *chastity cage*"
                        break
                    }
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (!hasPadlock(lockPickTarget)) {
                    return send({
                        embeds: [new ErrorEmbed("this member doesn't have a padlock")],
                    })
                }

                setPadlock(lockPickTarget, false)

                inventory["lock_pick"]--

                if (inventory["lock_pick"] <= 0) {
                    delete inventory["lock_pick"]
                }

                addItemUse(message.member, selected.id)

                setInventory(message.member, inventory)

                const targetEmbed = new CustomEmbed().setFooter("use $optout to optout of bot dms") // eslint-disable-line

                targetEmbed.setColor("#e4334f")
                targetEmbed.setTitle("your padlock has been picked")
                targetEmbed.setDescription(
                    "**" +
                        message.member.user.tag +
                        "** has picked your padlock in **" +
                        message.guild.name +
                        "**\n" +
                        "your money is no longer protected by a padlock"
                )

                if (getDMsEnabled(lockPickTarget)) {
                    await lockPickTarget.send({ embeds: [targetEmbed] })
                }
                embed.setDescription(`picking **${lockPickTarget.user.tag}**'s padlock...`)
                laterDescription = `picking **${lockPickTarget.user.tag}'**s padlock...\n\nyou have successfully picked their padlock`
                break

            case "mask":
                if (
                    !onRobCooldown(message.member) &&
                    !onBankRobCooldown(message.member) &&
                    !onStoreRobCooldown(message.member)
                ) {
                    return send({
                        embeds: [new ErrorEmbed("you are currently not on a rob cooldown")],
                    })
                }

                if (onRobCooldown(message.member)) {
                    deleteRobCooldown(message.member)
                    embed.setDescription("you're wearing your **mask** and can now rob someone again")
                } else if (onBankRobCooldown(message.member)) {
                    deleteBankRobCooldown(message.member)
                    embed.setDescription("you're wearing your **mask** and can now rob a bank again")
                } else if (onStoreRobCooldown(message.member)) {
                    deleteStoreRobCooldown(message.member)
                    embed.setDescription("you're wearing your **mask** and can now rob a store again")
                }

                inventory["mask"]--

                if (inventory["mask"] <= 0) {
                    delete inventory["mask"]
                }

                addItemUse(message.member, selected.id)

                setInventory(message.member, inventory)
                break

            case "radio":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${getPrefix(message.guild)}use radio <member>`)],
                    })
                }

                let radioTarget // eslint-disable-line

                if (!message.mentions.members.first()) {
                    radioTarget = await getMember(message, args[1])
                } else {
                    radioTarget = message.mentions.members.first()
                }

                if (!radioTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (message.member == radioTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (onRadioCooldown(radioTarget)) {
                    return send({
                        embeds: [new ErrorEmbed(`the police are already looking for **${radioTarget.user.tag}**`)],
                    })
                }

                addItemUse(message.member, selected.id)

                addRadioCooldown(radioTarget.id)

                inventory["radio"]--

                if (inventory["radio"] <= 0) {
                    delete inventory["radio"]
                }

                setInventory(message.member, inventory)

                embed.setDescription("putting report out on police scanner...")
                laterDescription = `putting report out on police scanner...\n\nthe police are now looking for **${radioTarget.user.tag}**`
                break

            case "chastity_cage":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${getPrefix(message.guild)}use chastity <member>`)],
                    })
                }

                let chastityTarget // eslint-disable-line

                if (!message.mentions.members.first()) {
                    chastityTarget = await getMember(message, args[1])
                } else {
                    chastityTarget = message.mentions.members.first()
                }

                if (!chastityTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (message.member == chastityTarget) {
                    return send({
                        embeds: [new ErrorEmbed("why would you do that to yourself.")],
                    })
                }

                if (onChastityCooldown(chastityTarget.id)) {
                    return send({
                        embeds: [new ErrorEmbed(`**${chastityTarget.user.tag}** is already equipped with a chastity cage`)],
                    })
                }

                addItemUse(message.member, selected.id)

                addChastityCooldown(chastityTarget.id)

                inventory["chastity_cage"]--

                if (inventory["chastity_cage"] <= 0) {
                    delete inventory["chastity_cage"]
                }

                setInventory(message.member, inventory)

                embed.setDescription("locking chastity cage...")
                laterDescription = `locking chastity cage...\n\n**${chastityTarget.user.tag}**'s chastity cage is now locked in place`
                break

            case "handcuffs":
                if (args.length == 1) {
                    return send({
                        embeds: [new ErrorEmbed(`${getPrefix(message.guild)}use handcuffs <member>`)],
                    })
                }

                let handcuffsTarget // eslint-disable-line

                if (!message.mentions.members.first()) {
                    handcuffsTarget = await getMember(message, args[1])
                } else {
                    handcuffsTarget = message.mentions.members.first()
                }

                if (!handcuffsTarget) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                if (message.member == handcuffsTarget) {
                    return send({ embeds: [new ErrorEmbed("bit of self bondage huh")] })
                }

                if (isHandcuffed(handcuffsTarget.user.id)) {
                    return send({
                        embeds: [new ErrorEmbed(`**${handcuffsTarget.user.tag}** is already restrained`)],
                    })
                }

                addItemUse(message.member, selected.id)

                addHandcuffs(handcuffsTarget.id)

                inventory["handcuffs"]--

                if (inventory["handcuffs"] <= 0) {
                    delete inventory["handcuffs"]
                }

                setInventory(message.member, inventory)

                embed.setDescription(`restraining **${handcuffsTarget.user.tag}**...`)
                laterDescription = `restraining **${handcuffsTarget.user.tag}**...\n\n**${handcuffsTarget.user.tag}** has been restrained for one minute`
                break

            default:
                return send({ embeds: [new ErrorEmbed("you cannot use this item")] })
        }
    }

    const msg = await send({ embeds: [embed] })

    if (!laterDescription) return

    const edit = async (data, msg) => {
        if (message.interaction) {
            await message.editReply(data)
            return await message.fetchReply()
        } else {
            return await msg.edit(data)
        }
    }

    setTimeout(() => {
        embed.setDescription(laterDescription)
        edit({ embeds: [embed] }, msg)
    }, 2000)
}

cmd.setRun(run)

module.exports = cmd
