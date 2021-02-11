const { table, getBorderCharacters } = require("table")
const { updateXp, getXp, userExists } = require("../economy/utils.js")
const fs = require("fs")
const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils.js")
const { Command, categories } = require("./classes/Command")
const { CustomEmbed } = require("./classes/EmbedBuilders.js")
const { getTimestamp } = require("./utils.js")

const commands = new Map()
const aliases = new Map()
const xpCooldown = new Set()
const cooldown = new Set()

function loadCommands() {
    console.log(`[${getTimestamp()}] loading commands..`)
    const commandFiles = fs.readdirSync("./commands/").filter(file => file.endsWith(".js"))
    const failedTable = []

    if (commands.size > 0) {
        for (let command of commands.keys()) {
            delete require.cache[require.resolve(`../commands/${command}.js`)]
        }
        commands.clear()
    }

    for (let file of commandFiles) {
        let command
        
        try {
            command = require(`../commands/${file}`)

            let enabled = true
        
            if (!command.name || !command.description || !command.run || !command.category) {
                enabled = false
            }

            if (enabled) {
                commands.set(command.name, command)
                if (command.aliases) {
                    for (let a of command.aliases) {
                        aliases.set(a, command.name)
                    }
                }
            } else {
                failedTable.push([file, "❌"])
                console.log(file + " missing name, description, category or run")
            }
        } catch (e) {
            failedTable.push([file, "❌"])
            console.log(e)
        }
    }
    exports.aliasesSize = aliases.size
    exports.commandsSize = commands.size

    if (failedTable.length != 0) {
        console.log(table(failedTable, {border: getBorderCharacters("ramac")}))
    } else {
        console.log(`[${getTimestamp()}] all commands loaded without error ✅`)
    }
}

/**
 * 
 * @param {Array} commandsArray 
 */
function reloadCommand(commandsArray) {
    const reloadTable = []

    for (let cmd of commandsArray) {
        try {
            commands.delete(cmd)
            if (aliases.has(cmd)) {
                aliases.delete(cmd)
            }
            try {
                delete require.cache[require.resolve(`../commands/${cmd}`)]
            } catch (e) {
                return console.log("error deleting from cache")
            }
            
            const commandData = require(`../commands/${cmd}`)
        
            let enabled = true
            
            if (!commandData.name || !commandData.description || !commandData.run || !commandData.category) {
                enabled = false
            }
            
            if (enabled) {
                commands.set(commandData.name, commandData)
                if (commandData.aliases) {
                    for (let a of commandData.aliases) {
                        aliases.set(a, commandData.name)
                    }
                }
                reloadTable.push([commandData.name, "✅"])
                exports.commandsSize = commands.size
            } else {
                reloadTable.push([cmd, "❌"])
                exports.commandsSize = commands.size
            }
        } catch (e) {
            reloadTable.push([cmd, "❌"])
            console.log(e)
        }
    }
    exports.aliasesSize = aliases.size
    exports.commandsSize = commands.size
    console.log(table(reloadTable, {border: getBorderCharacters("ramac")}))
    return table(reloadTable, {border: getBorderCharacters("ramac")})
}

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function helpCmd(message, args) {
    logCommand(message, args)

    const helpCategories = new Map()

    const prefix = getPrefix(message.guild)

    for (let cmd of commands.keys()) {
        const category = getCmdCategory(cmd)

        if (helpCategories.has(category)) {
            const current = helpCategories.get(category)
            const lastPage = current.get(current.size)

            if (lastPage.length == 10) {
                const newPage = []

                newPage.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`)
                current.set(current.size + 1, newPage)
            } else {
                const page = current.get(current.size)
                page.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`)
                current.set(current.size, page)
            }

            helpCategories.set(category, current)
        } else {
            const pages = new Map()

            pages.set(1, [`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`])

            helpCategories.set(category, pages)
        }
    }

    const embed = new CustomEmbed(message.member)
        .setTitle("help")
        .setFooter(prefix + "help <command> | get more info about a command")


    /**
     * FINDING WHAT THE USER REQUESTED
    */

    let pageSystemNeeded = false

    if (args.length == 0) {
        embed.addField("fun", prefix + "**help** fun", true)
        embed.addField("info", prefix + "**help** info", true)
        embed.addField("money", prefix + "**help** money", true)
        embed.addField("mod", prefix + "**help** mod", true)
        embed.addField("nsfw", prefix + "**help** nsfw", true)
        embed.addField("support", "https://discord.gg/hJTDNST", true)
    } else {
        if (args[0].toLowerCase() == "mod") args[0] = "moderation"
        if (helpCategories.has(args[0].toLowerCase())) {
            const pages = helpCategories.get(args[0].toLowerCase())

            if (pages.size > 1) {
                pageSystemNeeded = true
            }

            embed.setDescription(pages.get(1))
            embed.setFooter(`page 1/${pages.size} | ${prefix}help <command>`)

        } else if (commands.has(args[0].toLowerCase()) || aliases.has(args[0].toLowerCase())) {
            let cmd

            if (aliases.has(args[0].toLowerCase())) {
                cmd = commands.get(aliases.get(args[0].toLowerCase()))
            } else {
                cmd = commands.get(args[0].toLowerCase())
            }

            let desc = "**name** " + cmd.name + "\n" +
                "**description** " + cmd.description + "\n" +
                "**category** " + cmd.category

            if (cmd.permissions) {
                desc = desc + "\n**permission(s) required** `" + cmd.permissions.join("`, `") + "`"
            }

            if (cmd.aliases) {
                desc = desc + "\n**aliases** `" + prefix + cmd.aliases.join("`, `" + prefix) + "`"
            }
            embed.setDescription(desc)
        } 
    }
    
    const msg = await message.channel.send(embed)

    if (!pageSystemNeeded) return

    const pages = helpCategories.get(args[0].toLowerCase())

    await msg.react("⬅")
    await msg.react("➡")

    let currentPage = 1
    const lastPage = pages.size

    const filter = (reaction, user) => {
        return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    async function pageManager() {
        const reaction = await msg.awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
            .then(collected => {
                return collected.first().emoji.name
            }).catch(async () => {
                await msg.reactions.removeAll()
            })

        if (!reaction) return

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage} | ${prefix}help <command>`)
                await msg.edit(embed)
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage} | ${prefix}help <command>`)
                await msg.edit(embed)
                return pageManager()
            }
        }
    }

    return pageManager()
}

/**
 * 
 * @param {String} cmd 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
function runCommand(cmd, message, args) {

    if (!message.channel.permissionsFor(message.client.user).has("SEND_MESSAGES")) {
        return message.member.send("❌ i don't have permission to send messages in that channel - please contact server staff if this is an error")
    }

    if (!message.channel.permissionsFor(message.client.user).has("EMBED_LINKS")) {
        return message.channel.send("❌ i don't have the `embed links` permission\n\nto fix this go to: server settings -> roles -> find my role and enable `embed links`\n" +
            "if this error still shows, check channel specific permissions")
    }

    if (!message.channel.permissionsFor(message.client.user).has("MANAGE_MESSAGES")) {
        return message.channel.send("❌ i don't have the `manage messages` permission, this is a required permission for nypsi to work\n\n" +
            "to fix this go to: server settings -> roles -> find my role and enable `manage messages`\n" +
            "if this error still shows, check channel specific permissions")
    }

    if (!message.channel.permissionsFor(message.client.user).has("ADD_REACTIONS")) {
        return message.channel.send("❌ i don't have the `add reactions` permission, this is a required permission for nypsi to work\n\n" +
            "to fix this go to: server settings -> roles -> find my role and enable `add reactions`\n" +
            "if this error still shows, check channel specific permissions")
    }

    if (cmd == "help") {
        return helpCmd(message, args)
    }

    let alias = false
    if (!commandExists(cmd)) {
        if (!aliases.has(cmd)) {
            return
        } else {
            alias = true
        }
    }

    if (cooldown.has(message.author.id)) return

    cooldown.add(message.author.id)

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 500)

    try {
        logCommand(message, args)
        if (alias) {
            commands.get(aliases.get(cmd)).run(message, args)
        } else {
            commands.get(cmd).run(message, args)
        }
    } catch(e) {
        console.log(e)
    }

    let cmdName = cmd

    if (alias) {
        cmdName = aliases.get(cmd)
    }

    if (getCmdCategory(cmdName) == "money") {
        try {
            if (!message.member) return
            if (!userExists(message.member)) return
        
            setTimeout(() => {
                try {
                    if (!xpCooldown.has(message.author.id)) {
                        updateXp(message.member, getXp(message.member) + 1)
                
                        xpCooldown.add(message.author.id)
                
                        setTimeout(() => {
                            try {
                                xpCooldown.delete(message.author.id)
                            } catch {
                                console.log("error deleting from xpCooldown")
                            }
                        }, 60000)
                    }
                } catch (e) {
                    console.log(e)
                }
            }, 10000)
        } catch (e) {
            console.log(e)
        }
    }
}

/**
 * 
 * @param {String} cmd 
 */
function commandExists(cmd) {
    if (commands.has(cmd)) {
        return true
    } else {
        return false
    }
}

exports.helpCmd = helpCmd
exports.loadCommands = loadCommands
exports.reloadCommand = reloadCommand
exports.runCommand = runCommand
exports.commandExists = commandExists

function getCmdName(cmd) {
    return commands.get(cmd).name
}

function getCmdDesc(cmd) {
    return commands.get(cmd).description
}

function getCmdCategory(cmd) {
    return commands.get(cmd).category
}

async function getRandomCommand() {
    const a = []

    await commands.forEach(d => {
        if (d.category != "none" && d.category != "nsfw") {
            a.push(d)
        }
    })

    const choice = a[Math.floor(Math.random() * a.length)]

    return choice
}

exports.getRandomCommand = getRandomCommand

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 * @param {String} commandName
 */
function logCommand(message, args) {
    args.shift()

    const server = message.guild.name

    let content = message.content

    if (content.length > 100) {
        content = content.substr(0, 75) + "..."
    }

    const msg = `\x1b[33m[${getTimestamp()}] [${message.guild.id} - ${message.author.id}] ${message.author.tag}: '${content}'\x1b[37m`

    console.log(msg)
}