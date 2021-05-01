const { Message, GuildMember } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory, setInventory, updateBalance, getBalance } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command("use", "use an item or open crates", categories.MONEY).setAliases(["open"])

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
    "basic_crate",
    "69420_crate",
    "large_fish",
    "terrible_fishing_rod",
    "fishing_rod",
    "incredible_fishing_rod",
    "standard_watch",
    "golden_watch",
    "diamond_watch",
    "bitcoin",
    "dogecoin",
    "terrible_gun",
    "gun",
    "incredible_gun",
    "normal_rabbit",
    "large_rabbit",
    "deer",
    "rat",
    "mouse",
    "kangaroo",
    "calendar",
    "padlock",
    "lock_pick",
    "mask",
    "tooth",
    "clover",
    "teddy",
    "floppy_disk",
    "test_tube",
    "match_attax",
    "pokemon_card",
    "skyline_r34",
    "toyota_supra",
    "lawyer",
    "minecraft_account",
]

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {

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
    }

    const embed = new CustomEmbed(message.member, true).setTitle("use | " + message.author.username)

    let laterDescription

    if (selected.role == "crate") {
        const items = openCrate(message.member, selected)

        embed.setDescription(`opening ${selected.emoji} ${selected.name}...`)
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

    inventory[item.id] -= 1

    if (inventory[item.id] == 0) {
        delete inventory[item.id]
    }

    setInventory(member, inventory)

    let times = 2

    if (item.id.includes("vote")) {
        times = 1
    } else if (item.id.includes("69420")) {
        updateBalance(member, getBalance(member) + 69420)
    }

    const names = []

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

        if (inventory[chosen]) {
            inventory[chosen]++
        } else {
            inventory[chosen] = 1
        }

        names.push(chosen)
    }

    setInventory(member, inventory)

    return names
}