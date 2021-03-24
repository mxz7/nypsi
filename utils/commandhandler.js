const { table, getBorderCharacters } = require("table")
const { updateXp, getXp, userExists } = require("../economy/utils.js")
const fs = require("fs")
const { Message, Client } = require("discord.js")
const { getPrefix, getDisabledCommands } = require("../guilds/utils.js")
const { Command, categories } = require("./classes/Command")
const { CustomEmbed, ErrorEmbed } = require("./classes/EmbedBuilders.js")
const { getTimestamp, MStoTime, getNews, formatDate } = require("./utils.js")

const commands = new Map()
const aliases = new Map()
const popularCommands = new Map()
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

        if (category == "none") continue

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
        .setFooter(prefix + "help <command> | get info about a command")


    /**
     * FINDING WHAT THE USER REQUESTED
    */

    let pageSystemNeeded = false

    if (args.length == 0) {

        const categories = Array.from(helpCategories.keys()).sort()

        let categoriesMsg = ""
        let categoriesMsg2 = ""

        for (const category of categories) {
            categoriesMsg += `» ${prefix}help **${category}**\n`
        }

        const news = getNews()

        const lastSet = formatDate(news.date)

        embed.setTitle("help menu")
        embed.setDescription("invite nypsi to your server: [invite.nypsi.xyz](http://invite.nypsi.xyz)\n\n" +
            "if you need support, want to report a bug or suggest a feature, you can join the nypsi server: https://discord.gg/hJTDNST\n\n" +
            `my prefix for this server is \`${prefix}\``)
        embed.addField("command categories", categoriesMsg, true)
        embed.setThumbnail(message.client.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

        if (news.text != "") {
            embed.addField("news", `${news.text} - *${lastSet}*`)
        }
    } else {
        if (args[0].toLowerCase() == "mod") args[0] = "moderation"
        if (args[0].toLowerCase() == "util") args[0] = "utility"
        if (args[0].toLowerCase() == "pictures") args[0] = "animals"
        if (args[0].toLowerCase() == "eco") args[0] = "money"
        if (args[0].toLowerCase() == "economy") args[0] = "money"
        if (args[0].toLowerCase() == "gamble") args[0] = "money"
        if (args[0].toLowerCase() == "gambling") args[0] = "money"

        if (helpCategories.has(args[0].toLowerCase())) {
            const pages = helpCategories.get(args[0].toLowerCase())

            if (pages.size > 1) {
                pageSystemNeeded = true
            }

            embed.setTitle(`${args[0].toLowerCase()} commands`)
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

            embed.setTitle(`${cmd.name} command`)
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
            updatePopularCommands(commands.get(aliases.get(cmd)).name)
            if (getDisabledCommands(message.guild).indexOf(aliases.get(cmd)) != -1) {
                return message.channel.send(new ErrorEmbed("that command has been disabled"))
            }
            commands.get(aliases.get(cmd)).run(message, args)
        } else {
            updatePopularCommands(commands.get(cmd).name)
            if (getDisabledCommands(message.guild).indexOf(cmd) != -1) {
                return message.channel.send(new ErrorEmbed("that command has been disabled"))
            }
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

/**
 * @param {String} command
 */
function updatePopularCommands(command) {
    if (popularCommands.has(command)) {
        popularCommands.set(command, popularCommands.get(command) + 1)
    } else {
        popularCommands.set(command, 1)
    }
}

/**
 * @param {Client} client
 * @param {String} serverID
 * @param {String} channelID
 */
function runPopularCommandsTimer(client, serverID, channelID) {

    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    const postPopularCommands = async () => {
        const guild = await client.guilds.fetch(serverID)
    
        if (!guild) {
            return console.log("UNABLE TO FETCH GUILD FOR POPULAR COMMANDS", serverID, channelID)
        }
    
        const channel = await guild.channels.cache.find(ch => ch.id == channelID)
    
        if (!channel) {
            return console.log("UNABLE TO FIND CHANNEL FOR POPULAR COMMANDS", serverID, channelID)
        }
    
        const sortedCommands = new Map([...popularCommands.entries()].sort((a, b) => b[1] - a[1]))
    
        let msg = ""
        let count = 1
            
        for (let [key, value] of sortedCommands) {
            if (count >= 11) break

            let pos = count

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            msg += `${pos} \`$${key}\` used **${value.toLocaleString()}** times\n`
            count++
        }
    
        const embed = new CustomEmbed()
    
        embed.setTitle("top 10 commands from today")
        embed.setDescription(msg)
        embed.setColor("#000001")

        channel.send(embed)

        popularCommands.clear()
    }

    setTimeout(async () => {
        setInterval(() => {
            postPopularCommands()
        }, 86400000)
        postPopularCommands()
    }, needed - now)

    console.log(`[${getTimestamp()}] popular commands will run in ${MStoTime(needed - now)}`)
}

exports.runPopularCommandsTimer = runPopularCommandsTimer