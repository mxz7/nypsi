const { Message, GuildMember } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory, setInventory, updateBalance, getBalance, userExists, createUser, updateXp, getXp, hasPadlock, setPadlock, addPadlock, getMaxBitcoin, getMaxDogecoin, getDMsEnabled } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { getMember } = require("../utils/utils")

const cmd = new Command("use", "use an item or open crates", categories.MONEY).setAliases(["open"])

const cooldown = new Map()

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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    if (args.length == 0) {
        return message.channel.send(new CustomEmbed(message.member, false, `${getPrefix(message.guild)}use <item>\n\nuse items to open crates or to simply use the item's function`).setTitle("use | " + message.author.username))
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
        return message.channel.send(new ErrorEmbed(`couldnt find \`${args[0]}\``))
    }

    if (!inventory[selected.id] || inventory[selected.id] == 0) {
        return message.channel.send(new ErrorEmbed(`you dont have a ${selected.name}`))
    }

    if (selected.role != "item" && selected.role != "tool" && selected.role != "crate") {
        return message.channel.send(new ErrorEmbed("you cannot use this item"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (selected.id.includes("gun")) {
        return message.channel.send(new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}hunt`))
    } else if (selected.id.includes("fishing")) {
        return message.channel.send(new ErrorEmbed(`this item is used with ${getPrefix(message.guild)}fish`))
    } else if (selected.id.includes("coin")) {
        return message.channel.send(new ErrorEmbed("you cant use a coin 🙄"))
    }

    const embed = new CustomEmbed(message.member).setTitle("use | " + message.author.username)

    let laterDescription

    if (selected.role == "crate") {
        const itemsFound = openCrate(message.member, selected)

        embed.setDescription(`opening ${selected.emoji} ${selected.name}...`)

        laterDescription = `opening ${selected.emoji} ${selected.name}...\n\nyou found: \n - ${itemsFound.join("\n - ")}`
    } else if (selected.id.includes("watch")) {
        embed.setDescription("you look down at your watch to check the time..")

        laterDescription = `you look down at your watch to check the time..\n\nit's ${new Date().toTimeString()}`
    } else if (selected.id.includes("calendar")) {
        embed.setDescription("you look at your calendar to check the date..")

        laterDescription = `you look at your calendar to check the date..\n\nit's ${new Date().toDateString()}`
    } else if (selected.id == "padlock") {
        if (hasPadlock(message.member)) {
            return message.channel.send(new ErrorEmbed("you already have a padlock on your balance"))
        }

        setPadlock(message.member, true)
        inventory["padlock"]--

        if (inventory["padlock"] <= 0) {
            delete inventory["padlock"]
        }

        setInventory(message.member, inventory)
        
        addPadlock(message.member)

        embed.setDescription("✅ your padlock has been applied")
    } else if (selected.id == "lawyer") {
        embed.setDescription("lawyers will be used automatically when you rob someone")
    } else if (selected.id == "lock_pick") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${getPrefix(message.guild)}use lockpick <member>`))
        }

        let target

        if (!message.mentions.members.first()) {
            target = await getMember(message, args[1])
        } else {
            target = message.mentions.members.first()
        }

        if (!target) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }

        if (!hasPadlock(target)) {
            return message.channel.send(new ErrorEmbed("this member doesn't have a padlock"))
        }

        setPadlock(target, false)

        inventory["lock_pick"]--

        if (inventory["lock_pick"] <= 0) {
            delete inventory["lock_pick"]
        }

        setInventory(message.member, inventory)

        const targetEmbed = new CustomEmbed().setFooter("use $optout to optout of bot dms")

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

        if (getDMsEnabled(target)) {
            await target.send(targetEmbed)
        }
        embed.setDescription(`picking **${target.user.tag}**'s padlock...`)
        laterDescription = `picking **${target.user.tag}'**s padlock...\n\nyou have successfully picked their padlock`
    } else if (selected.id == "mask") {
        const { onRobCooldown, deleteRobCooldown } = require("./rob")
        
        if (!onRobCooldown(message.member)) {
            return message.channel.send(new ErrorEmbed("you are currently not on rob cooldown"))
        }

        deleteRobCooldown(message.member)

        inventory["mask"]--

        if (inventory["mask"] <= 0) {
            delete inventory["mask"]
        }

        setInventory(message.member, inventory)

        embed.setDescription("you're wearing your **mask** and can now rob someone again")
    } else if (selected.id == "radio") {
        if (args.length == 1) {
            return message.channel.send(
                new ErrorEmbed(`${getPrefix(message.guild)}use radio <member>`)
            )
        }

        let target

        if (!message.mentions.members.first()) {
            target = await getMember(message, args[1])
        } else {
            target = message.mentions.members.first()
        }

        if (!target) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }

        const { onRadioCooldown, addRadioCooldown } = require("./rob")

        if (!onRadioCooldown(target)) {
            return message.channel.send(new ErrorEmbed(`the police are already looking for **${target.user.tag}**`))
        }

        addRadioCooldown(target.id)

        inventory["radio"]--

        if (inventory["radio"] <= 0) {
            delete inventory["radio"]
        }

        setInventory(message.member, inventory)

        embed.setDescription("putting report out on police scanner...")
        laterDescription = `putting report out on police scanner...\n\nthe police are now looking for **${target.user.tag}**`
    } else {
        return message.channel.send(new ErrorEmbed("you cannot use this item"))
    }

    const msg = await message.channel.send(embed)

    if (!laterDescription) return

    setTimeout(() => {
        embed.setDescription(laterDescription)
        msg.edit(embed)
    }, 2000)
}

cmd.setRun(run)

module.exports = cmd

/**
 * 
 * @param {GuildMember} member 
 * @param {JSON} item 
 */
function openCrate(member, item) {
    const inventory = getInventory(member)
    const items = getItems()

    const crateItems = [
        "money:10000",
        "money:15000",
        "money:20000",
        "money:50000",
        "money:100000",
        "xp:5",
        "xp:10",
        "xp:15",
        "xp:25",
        "xp:50",
    ]

    for (const i of Array.from(Object.keys(items))) {
        crateItems.push(i)
    }

    inventory[item.id] -= 1

    if (inventory[item.id] == 0) {
        delete inventory[item.id]
    }

    setInventory(member, inventory)

    let times = 2
    const names = []

    if (item.id.includes("vote")) {
        times = 1
    } else if (item.id.includes("69420")) {
        updateBalance(member, getBalance(member) + 69420)
        names.push("$69,420")
    }

    for (let i = 0; i < times; i++) {
        const crateItemsModified = []

        for (const i of crateItems) {
            if (items[i]) {
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15)
                    if (chance == 4) {
                        crateItemsModified.push(i)
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3)
                    if (chance == 2) {
                        crateItemsModified.push(i)
                    }
                } else if (items[i].rarity == 2) {
                    crateItemsModified.push(i)
                } else if (items[i].rarity == 1) {
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                } else if (items[i].rarity == 0) {
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                }
            } else {
                crateItemsModified.push(i)
                crateItemsModified.push(i)
            }
        }

        const chosen = crateItemsModified[Math.floor(Math.random() * crateItemsModified.length)]

        if (chosen == "bitcoin") {
            const owned = inventory["bitcoin"] || 0
            const max = getMaxBitcoin(member)

            if (owned + 1 > max) {
                i--
                continue
            }
        } else if (chosen == "dogecoin") {
            const owned = inventory["dogecoin"] || 0
            const max = getMaxDogecoin(member)

            if (owned + 1 > max) {
                i--
                continue
            }
        } else if (chosen.includes("money:") || chosen.includes("xp:")) {
            if (chosen.includes("money:")) {
                const amount = parseInt(chosen.substr(6))

                updateBalance(member, getBalance(member) + amount)
                names.push("$" + amount.toLocaleString())
            } else if (chosen.includes("xp:")) {
                const amount = parseInt(chosen.substr(3))

                updateXp(member, getXp(member) + amount)
                names.push(amount + "xp")
            }
        } else {
            let amount = 1

            if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun") {
                amount = 5
            } else if (chosen == "fishing_rod" || chosen == "gun") {
                amount = 10
            } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun") {
                amount = 25
            }

            if (inventory[chosen]) {
                inventory[chosen] += amount
            } else {
                inventory[chosen] = amount
            }
            names.push(`${items[chosen].emoji} ${items[chosen].name}`)
        }
    }

    setInventory(member, inventory)

    return names
}