const { table, getBorderCharacters } = require("table")
const { updateXp, getXp, userExists, isEcoBanned } = require("../utils/economy/utils.js")
const fs = require("fs")
const { Message, Client, MessageActionRow, MessageButton } = require("discord.js")
const { getPrefix, getDisabledCommands, getChatFilter, hasGuild, createGuild } = require("../utils/guilds/utils")
const { Command, categories } = require("./classes/Command")
const { CustomEmbed, ErrorEmbed } = require("./classes/EmbedBuilders.js")
const { MStoTime, getNews, formatDate, isLockedOut, createCaptcha, toggleLock } = require("./utils.js")
const { info, types, error } = require("./logger.js")
const { getCommand, addUse } = require("./premium/utils.js")
const { start } = require("repl")

const commands = new Map()
const aliases = new Map()
const popularCommands = new Map()
const noLifers = new Map()
const xpCooldown = new Set()
const cooldown = new Set()
const handcuffs = new Map()

const beingChecked = []

let restarting = false

function loadCommands() {
    const commandFiles = fs.readdirSync("./commands/").filter((file) => file.endsWith(".js"))
    const failedTable = []

    if (commands.size > 0) {
        for (let command of commands.keys()) {
            delete require.cache[require.resolve(`../commands/${command}.js`)]
        }
        commands.clear()
        aliases.clear()
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
                        if (aliases.has(a)) {
                            error(
                                `duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${command.name}] - not overwriting`
                            )
                        } else {
                            aliases.set(a, command.name)
                        }
                    }
                }
            } else {
                failedTable.push([file, "❌"])
                error(file + " missing name, description, category or run")
            }
        } catch (e) {
            failedTable.push([file, "❌"])
            console.log(e)
        }
    }
    exports.aliasesSize = aliases.size
    exports.commandsSize = commands.size

    if (failedTable.length != 0) {
        console.log(table(failedTable, { border: getBorderCharacters("ramac") }))
    }

    info(`${commands.size.toLocaleString()} commands loaded`)
    info(`${aliases.size.toLocaleString()} aliases loaded`)
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
            try {
                delete require.cache[require.resolve(`../commands/${cmd}`)]
            } catch (e) {
                return error("error deleting from cache")
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
                        if (aliases.has(a) && aliases.get(a) != commandData.name) {
                            error(
                                `duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${
                                    commandData.name
                                }] - not overwriting`
                            )
                        } else {
                            aliases.set(a, commandData.name)
                        }
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
    console.log(table(reloadTable, { border: getBorderCharacters("ramac") }))
    return table(reloadTable, { border: getBorderCharacters("ramac") })
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

    const embed = new CustomEmbed(message.member).setFooter(prefix + "help <command> | get info about a command")

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
        embed.setDescription(
            "invite nypsi to your server: [invite.nypsi.xyz](http://invite.nypsi.xyz)\n\n" +
                "if you need support, want to report a bug or suggest a feature, you can join the nypsi server: https://discord.gg/hJTDNST\n\n" +
                `my prefix for this server is \`${prefix}\``
        )
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
            embed.setDescription(pages.get(1).join("\n"))
            embed.setFooter(`page 1/${pages.size} | ${prefix}help <command>`)
        } else if (commands.has(args[0].toLowerCase()) || aliases.has(args[0].toLowerCase())) {
            let cmd

            if (aliases.has(args[0].toLowerCase())) {
                cmd = commands.get(aliases.get(args[0].toLowerCase()))
            } else {
                cmd = commands.get(args[0].toLowerCase())
            }

            let desc =
                "**name** " + cmd.name + "\n" + "**description** " + cmd.description + "\n" + "**category** " + cmd.category

            if (cmd.permissions) {
                desc = desc + "\n**permission(s) required** `" + cmd.permissions.join("`, `") + "`"
            }

            if (cmd.aliases) {
                desc = desc + "\n**aliases** `" + prefix + cmd.aliases.join("`, `" + prefix) + "`"
            }

            embed.setTitle(`${cmd.name} command`)
            embed.setDescription(desc)
        } else if (getCommand(args[0].toLowerCase())) {
            const member = await message.guild.members.cache.find((m) => m.id == getCommand(args[0].toLowerCase()).owner)
            embed.setTitle("custom command")
            embed.setDescription(
                `this is a custom command${
                    member ? ` owned by ${member.toString()}` : ""
                }\n\nto disable custom commands in your server you can do:\n${getPrefix(
                    message.guild
                )}disablecmd + customcommand`
            )
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("unknown command")] })
        }
    }

    /**
     * @type {Message}
     */
    let msg

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (pageSystemNeeded) {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    } else {
        return await message.channel.send({ embeds: [embed] })
    }

    const pages = helpCategories.get(args[0].toLowerCase())

    let currentPage = 1
    const lastPage = pages.size

    const filter = (i) => i.user.id == message.author.id

    const pageManager = async () => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                await collected.deferUpdate()
                return collected.customId
            })
            .catch(async () => {
                await msg.edit({ components: [] })
            })

        if (!reaction) return

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage} | ${prefix}help <command>`)
                if (currentPage == 1) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [embed], components: [row] })
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++
                embed.setDescription(pages.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage} | ${prefix}help <command>`)
                if (currentPage == lastPage) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [embed], components: [row] })
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
async function runCommand(cmd, message, args) {
    if (!hasGuild(message.guild)) createGuild(message.guild)

    if (!message.channel.permissionsFor(message.client.user).has("SEND_MESSAGES")) {
        return message.member
            .send(
                "❌ i don't have permission to send messages in that channel - please contact server staff if this is an error"
            )
            .catch(() => {})
    }

    if (!message.channel.permissionsFor(message.client.user).has("EMBED_LINKS")) {
        return message.channel.send({
            content:
                "❌ i don't have the `embed links` permission\n\nto fix this go to: server settings -> roles -> find my role and enable `embed links`\n" +
                "if this error still shows, check channel specific permissions",
        })
    }

    if (!message.channel.permissionsFor(message.client.user).has("MANAGE_MESSAGES")) {
        return message.channel.send(
            "❌ i don't have the `manage messages` permission, this is a required permission for nypsi to work\n\n" +
                "to fix this go to: server settings -> roles -> find my role and enable `manage messages`\n" +
                "if this error still shows, check channel specific permissions"
        )
    }

    if (!message.channel.permissionsFor(message.client.user).has("ADD_REACTIONS")) {
        return message.channel.send({
            content:
                "❌ i don't have the `add reactions` permission, this is a required permission for nypsi to work\n\n" +
                "to fix this go to: server settings -> roles -> find my role and enable `add reactions`\n" +
                "if this error still shows, check channel specific permissions",
        })
    }

    if (restarting) {
        if (message.author.id == "672793821850894347") {
            message.react("💀")
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("nypsi is restarting..")] })
        }
    }

    if (cmd == "help") {
        return helpCmd(message, args)
    }

    let alias = false
    if (!commandExists(cmd)) {
        if (!aliases.has(cmd)) {
            if (isLockedOut(message.author.id)) return
            const customCommand = getCommand(cmd)

            if (!customCommand) {
                return
            }

            const content = customCommand.content

            if (cooldown.has(message.author.id)) return

            cooldown.add(message.author.id)

            setTimeout(() => {
                cooldown.delete(message.author.id)
            }, 1500)

            if (getDisabledCommands(message.guild).indexOf("customcommand") != -1) {
                return message.channel.send({
                    embeds: [new ErrorEmbed("custom commands have been disabled in this server")],
                })
            }

            const filter = getChatFilter(message.guild)

            let contentToCheck = content.toLowerCase().normalize("NFD")

            contentToCheck = contentToCheck.replace(/[^A-z0-9\s]/g, "")

            contentToCheck = contentToCheck.split(" ")

            for (const word of filter) {
                if (content.indexOf(word.toLowerCase()) != -1) {
                    return message.channel.send({
                        embeds: [new ErrorEmbed("this custom command is not allowed in this server")],
                    })
                }
            }

            message.content += ` [custom cmd - ${customCommand.owner}]`

            addUse(customCommand.owner)
            logCommand(message, ["", "", ""])

            const embed = new CustomEmbed(message.member, false, content).setFooter(
                `${customCommand.uses.toLocaleString()} use${customCommand.uses == 1 ? "" : "s"}`
            )

            return message.channel.send({ embeds: [embed] })
        } else {
            alias = true
        }
    }

    if (cooldown.has(message.author.id)) return

    cooldown.add(message.author.id)

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 500)

    if (isLockedOut(message.author.id)) {
        if (beingChecked.indexOf(message.author.id) != -1) return

        const captcha = createCaptcha()

        const embed = new CustomEmbed(message.member, false).setTitle("you have been locked")

        embed.setDescription(`type: \`${captcha.display}\``)

        beingChecked.push(message.author.id)

        await message.channel.send({ embeds: [embed] })

        info(`sent captcha (${message.author.id}) - awaiting reply`)

        const filter = (m) => m.author.id == message.author.id

        let fail = false

        const response = await message.channel
            .awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                return collected.first().content.toLowerCase()
            })
            .catch(() => {
                fail = true
                info(`captcha (${message.author.id}) failed`)
                return message.channel.send({
                    content:
                        message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
                })
            })

        beingChecked.splice(beingChecked.indexOf(message.author.id), 1)

        if (fail) {
            return
        }

        if (response == captcha.answer) {
            info(`captcha (${message.author.id}) passed`)
            toggleLock(message.author.id)
            return message.react("✅")
        } else {
            info(`captcha (${message.author.id}) failed`)
            return message.channel.send({
                content: message.author.toString() + " captcha failed, please **type** the letter/number combination shown",
            })
        }
    }

    logCommand(message, args)
    if (alias) {
        if (isEcoBanned(message.author.id)) {
            if (commands.get(aliases.get(cmd)).category == "money") {
                return
            }
        } else if (commands.get(aliases.get(cmd)).category == "money" && handcuffs.has(message.author.id)) {
            const init = handcuffs.get(message.member.user.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 120 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }

            return message.channel.send({
                embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
            })
        }

        updatePopularCommands(commands.get(aliases.get(cmd)).name, message.author.tag)

        if (getDisabledCommands(message.guild).indexOf(aliases.get(cmd)) != -1) {
            return message.channel.send({ embeds: [new ErrorEmbed("that command has been disabled")] })
        }
        commands.get(aliases.get(cmd)).run(message, args)
    } else {
        if (isEcoBanned(message.author.id)) {
            if (commands.get(cmd).category == "money") {
                return
            }
        } else if (commands.get(cmd).category == "money" && handcuffs.has(message.author.id)) {
            const init = handcuffs.get(message.member.user.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 120 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }

            return message.channel.send({
                embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
            })
        }

        updatePopularCommands(commands.get(cmd).name, message.author.tag)

        if (getDisabledCommands(message.guild).indexOf(cmd) != -1) {
            return message.channel.send({ embeds: [new ErrorEmbed("that command has been disabled")] })
        }
        commands.get(cmd).run(message, args)
    }

    let cmdName = cmd

    if (alias) {
        cmdName = aliases.get(cmd)
    }

    if (getCmdCategory(cmdName) == "money") {
        if (!message.member) return
        if (!userExists(message.member)) return

        setTimeout(() => {
            try {
                if (!xpCooldown.has(message.author.id)) {
                    try {
                        updateXp(message.member, getXp(message.member) + 1)

                        xpCooldown.add(message.author.id)

                        setTimeout(() => {
                            try {
                                xpCooldown.delete(message.author.id)
                            } catch {
                                error("error deleting from xpCooldown")
                            }
                        }, 60000)
                    } catch {
                        /*keeps lint happy*/
                    }
                }
            } catch (e) {
                console.log(e)
            }
        }, 10000)
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

    await commands.forEach((d) => {
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

    const msg = `${message.guild.id} - ${message.author.tag}: ${content}`

    info(msg, types.COMMAND)
}

/**
 * @param {String} command
 * @param {String} tag
 */
function updatePopularCommands(command, tag) {
    if (popularCommands.has(command)) {
        popularCommands.set(command, popularCommands.get(command) + 1)
    } else {
        popularCommands.set(command, 1)
    }

    if (noLifers.has(tag)) {
        noLifers.set(tag, noLifers.get(tag) + 1)
    } else {
        noLifers.set(tag, 1)
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
            return error("UNABLE TO FETCH GUILD FOR POPULAR COMMANDS", serverID, channelID)
        }

        const channel = await guild.channels.cache.find((ch) => ch.id == channelID)

        if (!channel) {
            return error("UNABLE TO FIND CHANNEL FOR POPULAR COMMANDS", serverID, channelID)
        }

        const sortedCommands = new Map([...popularCommands.entries()].sort((a, b) => b[1] - a[1]))

        const sortedNoLifers = new Map([...noLifers.entries()].sort((a, b) => b[1] - a[1]))

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
        embed.setColor("#111111")

        if (client.uptime < 86400 * 1000) {
            embed.setFooter("data is from less than 24 hours")
        } else {
            const noLifer = sortedNoLifers.keys().next().value

            embed.setFooter(`${noLifer} has no life (${sortedNoLifers.get(noLifer).toLocaleString()} commands)`)
        }

        await channel.send({ embeds: [embed] })
        info("sent popular commands", types.AUTOMATION)

        popularCommands.clear()
        noLifers.clear()
    }

    setTimeout(async () => {
        setInterval(() => {
            postPopularCommands()
        }, 86400000)
        postPopularCommands()
    }, needed - now)

    info(`popular commands will run in ${MStoTime(needed - now)}`, types.AUTOMATION)
}

exports.runPopularCommandsTimer = runPopularCommandsTimer

function isHandcuffed(id) {
    return handcuffs.has(id)
}

exports.isHandcuffed = isHandcuffed

function addHandcuffs(id) {
    handcuffs.set(id, new Date())

    setTimeout(() => {
        handcuffs.delete(id)
    }, 120000)
}

exports.addHandcuffs = addHandcuffs

function startRestart() {
    restarting = true
}

exports.startRestart = startRestart
