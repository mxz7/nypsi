const { GuildMember, Message, Client, Webhook } = require("discord.js")
const isImageUrl = require("is-image-url")
const fetch = require("node-fetch")
const { getZeroWidth } = require("./chatreactions/utils")
const { getDatabase } = require("./database/database")
const { logger } = require("./logger")
const db = getDatabase()
const imgur = require("imgur")
imgur.setClientId(process.env.IMGUR_TOKEN)

let uploadDisabled = false

let uploadCount = 0
setInterval(() => {
    uploadCount = 0
    logger.info("imgur upload count reset")
}, 86400000)

const news = {
    text: "",
    date: new Date().getTime(),
}

const locked = []

/**
 * @type {Webhook}
 */
let wholesomeWebhook

/**
 * @type {Array<{ id: Number, image: String, submitter: String, submitter_id: String, accepter: String, date: Date }>}
 */
let wholesomeCache

/**
 * @returns {String}
 * @param {GuildMember} member member to get color of
 */
function getColor(member) {
    if (member.displayHexColor == "#ffffff") {
        return "#111111"
    } else {
        return member.displayHexColor
    }
}

exports.getColor = getColor

/**
 * @returns {string}
 * @param {JSON} post
 * @param {Array} allowed
 */
async function redditImage(post, allowed) {
    let image = post.data.url

    if (image.includes("imgur.com/a/")) {
        post = allowed[Math.floor(Math.random() * allowed.length)]
        image = post.data.url
    }

    if (image.includes("imgur") && !image.includes("gif")) {
        image = "https://i.imgur.com/" + image.split("/")[3]
        if (!isImageUrl(image)) {
            image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
        }
        return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
    }

    if (image.includes("gfycat")) {
        const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then((url) => url.json())

        if (link.gfyItem) {
            image = link.gfyItem.max5mbGif
            return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
        }
    }

    let count = 0

    while (!isImageUrl(image)) {
        if (count >= 10) {
            logger.warn("couldnt find image @ " + post.data.subreddit_name_prefixed)
            return "lol"
        }

        count++

        post = allowed[Math.floor(Math.random() * allowed.length)]
        image = post.data.url

        if (image.includes("imgur.com/a/")) {
            post = allowed[Math.floor(Math.random() * allowed.length)]
            image = post.data.url
        }

        if (image.includes("imgur") && !image.includes("gif") && !image.includes("png")) {
            image = "https://i.imgur.com/" + image.split("/")[3]
            image = "https://i.imgur.com/" + image.split("/")[3] + ".png"
            if (!isImageUrl(image)) {
                image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
                return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
            }
        }

        if (image.includes("gfycat")) {
            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then((url) => url.json())

            if (link) {
                image = link.gfyItem.max5mbGif
                return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
            }
        }
    }

    let title = post.data.title

    if (title.length >= 150) {
        const a = title.split("")
        let newTitle = ""
        let count = 0

        for (let char of a) {
            if (count == 145) {
                newTitle = newTitle + "..."
                break
            } else {
                count++
                newTitle = newTitle + char
            }
        }

        title = newTitle
    }

    return image + "|" + title + "|" + post.data.permalink + "|" + post.data.author
}

exports.redditImage = redditImage

/**
 * @returns {GuildMember} member object
 * @param {Message} message
 * @param {String} memberName name of member
 */
async function getMember(message, memberName) {
    if (!message.guild) return null

    let members

    if (message.guild.memberCount == message.guild.members.cache.size && message.guild.memberCount <= 25) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
    }

    let target
    let possible = new Map()

    for (let member of members.keys()) {
        member = members.get(member)

        if (member.user.id == memberName) {
            target = member
            break
        } else if (member.user.tag.toLowerCase() == memberName.toLowerCase()) {
            target = member
            break
        } else if (member.user.username.toLowerCase() == memberName.toLowerCase()) {
            if (member.user.bot) {
                possible.set(3, member)
            } else {
                possible.set(0, member)
            }
        } else if (member.displayName.toLowerCase() == memberName.toLowerCase()) {
            if (member.user.bot) {
                possible.set(4, member)
            } else {
                possible.set(1, member)
            }
        } else if (member.user.tag.toLowerCase().includes(memberName.toLowerCase())) {
            if (member.user.bot) {
                possible.set(5, member)
            } else {
                possible.set(2, member)
            }
        } else if (member.displayName.toLowerCase().includes(memberName.toLowerCase())) {
            if (member.user.bot) {
                possible.set(6, member)
            } else {
                possible.set(3, member)
            }
        }
    }

    if (!target) {
        if (possible.get(0)) {
            target = possible.get(0)
        } else if (possible.get(1)) {
            target = possible.get(1)
        } else if (possible.get(2)) {
            target = possible.get(2)
        } else if (possible.get(3)) {
            target = possible.get(3)
        } else if (possible.get(4)) {
            target = possible.get(4)
        } else if (possible.get(5)) {
            target = possible.get(5)
        } else if (possible.get(6)) {
            target = possible.get(6)
        } else {
            target = null
        }
    }

    return target
}

exports.getMember = getMember

/**
 *
 * @param {Message} message
 * @param {String} memberName
 */
async function getExactMember(message, memberName) {
    if (!message.guild) return null

    let members

    if (message.guild.memberCount == message.guild.members.cache.size && message.guild.memberCount <= 25) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
    }

    let target = members.find((member) => {
        if (member.user.username.toLowerCase() == memberName.toLowerCase()) {
            return member
        } else if (member.user.tag.toLowerCase() == memberName.toLowerCase()) {
            return member
        } else if (member.user.id == memberName) {
            return member
        }
    })

    return target
}

exports.getExactMember = getExactMember

/**
 * @returns {String}
 * @param {Date} date
 */
function formatDate(date) {
    const options = { year: "numeric", month: "short", day: "numeric" }
    return new Intl.DateTimeFormat("en-US", options).format(date).toLowerCase().split(",").join("")
}

exports.formatDate = formatDate

/**
 * @returns {Number}
 * @param {Date} date
 */
function daysAgo(date) {
    const ms = Math.floor(new Date() - date)

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

exports.daysAgo = daysAgo

/**
 * @returns {String}
 */
function daysUntilChristmas() {
    let date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear()}`))
    const current = new Date()

    if (current.getMonth() >= 11) {
        if (current.getDate() > 25) {
            date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear() + 1}`))
        } else if (current.getDate() == 25) {
            return "ITS CHRISTMAS"
        }
    }

    return (daysUntil(date) + 1).toString()
}

exports.daysUntilChristmas = daysUntilChristmas

/**
 * @returns {Number}
 * @param {Date} date
 */
function daysUntil(date) {
    const ms = Math.floor(date - new Date())

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

exports.daysUntil = daysUntil

function MStoTime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor(daysms / (60 * 60 * 1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor(hoursms / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor(minutesms / 1000)

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}

exports.MStoTime = MStoTime

/**
 * @returns {String}
 */
function getNews() {
    return news
}

exports.getNews = getNews

/**
 * @param {Object} string
 */
function setNews(string) {
    news.text = string
    news.date = new Date().getTime()
}

exports.setNews = setNews

/**
 *
 * @param {String} string user id
 * @returns {Boolean}
 */
function isLockedOut(string) {
    if (locked.indexOf(string) == -1) {
        return false
    } else {
        return true
    }
}

exports.isLockedOut = isLockedOut

/**
 *
 * @param {String} string user id
 */
function toggleLock(string) {
    if (isLockedOut(string)) {
        locked.splice(locked.indexOf(string), 1)
    } else {
        locked.push(string)
    }
}

exports.toggleLock = toggleLock

/**
 *
 * @param {Client} client
 */
async function showTopGlobalBal(client) {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    const postGlobalBalTop = async () => {
        const { topAmountGlobal } = require("./economy/utils")
        const { CustomEmbed } = require("./models/EmbedBuilders")
        const guild = await client.guilds.fetch("747056029795221513")

        if (!guild) {
            return logger.error("UNABLE TO FETCH GUILD FOR GLOBAL BAL TOP")
        }

        const channel = await guild.channels.cache.find((ch) => ch.id == "833052442069434429")

        if (!channel) {
            return logger.error("UNABLE TO FIND CHANNEL FOR GLOBAL BAL TOP")
        }

        const baltop = await topAmountGlobal(10, client, true)

        const embed = new CustomEmbed()

        embed.setTitle("top 10 richest users")
        embed.setDescription(baltop.join("\n"))
        embed.setColor("#111111")

        await channel.send({ embeds: [embed] })
        logger.auto("sent global bal top")
    }

    setTimeout(async () => {
        setInterval(() => {
            postGlobalBalTop()
        }, 86400000)
        postGlobalBalTop()
    }, needed - now)

    logger.auto(`global bal top will run in ${MStoTime(needed - now)}`)
}

exports.showTopGlobalBal = showTopGlobalBal

/**
 * @returns {captcha}
 */
function createCaptcha() {
    return new captcha(Math.random().toString(36).substr(2, 7))
}

exports.createCaptcha = createCaptcha

class captcha {
    /**
     *
     * @param {String} d random letters
     * @returns {captcha}
     */
    constructor(d) {
        this.answer = d

        const zeroWidthCount = d.length / 2

        const zeroWidthChar = getZeroWidth()

        let displayWord = d

        for (let i = 0; i < zeroWidthCount; i++) {
            const pos = Math.floor(Math.random() * d.length + 1)

            displayWord = displayWord.substr(0, pos) + zeroWidthChar + displayWord.substr(pos)
        }

        this.display = displayWord

        return this
    }
}

/**
 * @returns {Boolean}
 * @param {GuildMember} submitter
 * @param {String} image
 */
async function suggestWholesomeImage(submitter, image) {
    if (!wholesomeWebhook) {
        const { getGuild } = require("../nypsi")
        const guild = await getGuild("747056029795221513")

        const webhooks = await guild.fetchWebhooks()

        wholesomeWebhook = await webhooks.find((w) => w.id == "846092969396142080")
        logger.info(`wholesome webhook assigned as ${wholesomeWebhook.id}`)
    }

    let query = db.prepare("SELECT id FROM wholesome WHERE image = ?").get(image)

    if (query) {
        return false
    }

    query = db.prepare("SELECT id FROM wholesome_suggestions WHERE image = ?").get(image)

    if (query) {
        return false
    }

    db.prepare("INSERT INTO wholesome_suggestions (image, submitter, submitter_id, upload) VALUES (?, ?, ?, ?)").run(
        image,
        submitter.user.tag,
        submitter.user.id,
        Date.now()
    )

    query = db.prepare("SELECT id FROM wholesome_suggestions WHERE image = ?").get(image)

    const { CustomEmbed } = require("./models/EmbedBuilders")

    const embed = new CustomEmbed().setColor("#111111").setTitle("wholesome suggestion #" + query.id)

    embed.setDescription(`**submitter** ${submitter.user.tag} (${submitter.user.id})\n**url** ${image}`)

    embed.setFooter(`$wholesome accept ${query.id} | $wholesome deny ${query.id}`)

    embed.setImage(image)

    await wholesomeWebhook.send({ embeds: [embed] })

    return true
}

exports.suggestWholesomeImage = suggestWholesomeImage

/**
 * @returns {Boolean}
 * @param {Number} id
 * @param {GuildMember} accepter
 */
function acceptWholesomeImage(id, accepter) {
    const query = db.prepare("SELECT * FROM wholesome_suggestions WHERE id = ?").get(id)

    if (!query) return false

    db.prepare("INSERT INTO wholesome (image, submitter, submitter_id, upload, accepter) VALUES (?, ?, ?, ?, ?)").run(
        query.image,
        query.submitter,
        query.submitter_id,
        query.upload,
        accepter.user.id
    )

    db.prepare("DELETE FROM wholesome_suggestions WHERE id = ?").run(id)

    clearWholesomeCache()

    const { requestDM } = require("../nypsi")
    const { getDMsEnabled } = require("./economy/utils")

    if (getDMsEnabled(query.submitter_id)) {
        requestDM(query.submitter_id, `your wholesome image (${query.image}) has been accepted`, true)
    }

    return true
}

exports.acceptWholesomeImage = acceptWholesomeImage

/**
 * @returns {Boolean}
 * @param {Number} id
 */
function denyWholesomeImage(id) {
    const query = db.prepare("SELECT * FROM wholesome_suggestions WHERE id = ?").get(id)

    if (!query) return false

    db.prepare("DELETE FROM wholesome_suggestions WHERE id = ?").run(id)

    return true
}

exports.denyWholesomeImage = denyWholesomeImage

/**
 * @returns {{ id: Number, image: String, submitter: String, submitter_id: String, accepter: String, date: Date }}
 * @param {id} Number
 */
function getWholesomeImage(id) {
    if (id) {
        const query = db.prepare("SELECT * FROM wholesome WHERE id = ?").get(id)
        return query
    } else {
        if (wholesomeCache) {
            return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)]
        } else {
            const query = db.prepare("SELECT * FROM wholesome").all()

            wholesomeCache = query

            return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)]
        }
    }
}

exports.getWholesomeImage = getWholesomeImage

function clearWholesomeCache() {
    wholesomeCache = undefined
}

exports.clearWholesomeCache = clearWholesomeCache

/**
 * @returns {Boolean}
 * @param {Number} id
 */
function deleteFromWholesome(id) {
    const query = db.prepare("DELETE FROM wholesome WHERE id = ?").run(id)

    clearWholesomeCache()

    if (query.changes > 0) {
        return true
    } else {
        return false
    }
}

exports.deleteFromWholesome = deleteFromWholesome

/**
 * @returns {{Array<{ id: Number, image: String, submitter: String, submitter_id: String, date: Date }>}}
 */
function getAllSuggestions() {
    const query = db.prepare("SELECT * FROM wholesome_suggestions").all()

    return query
}

exports.getAllSuggestions = getAllSuggestions

/**
 * @returns {String}
 * @param {String} url
 */
async function uploadImageToImgur(url) {
    let fallback = false

    if (uploadCount >= 775) fallback = true
    if (uploadDisabled) fallback = true
    let fail = false

    logger.info(`uploading ${url}`)
    const boobies = await imgur.uploadUrl(url).catch((e) => {
        logger.error(e)
        fail = true
    })

    if (fail) {
        uploadDisabled = true

        setTimeout(() => {
            uploadDisabled = false
        }, 1800000)

        fallback = true
    }

    if (fallback) {
        logger.info("using fallback uploader..")

        const res = await fallbackUpload(url)

        if (!res) {
            logger.error("fallback upload failed")
            return null
        }

        return res
    }

    logger.info("uploaded")

    return boobies.link
}

exports.uploadImage = uploadImageToImgur

async function fallbackUpload(url) {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_TOKEN}&image=${url}`).then((res) =>
        res.json()
    )

    if (!res.success) {
        return false
    }

    return res.display_url
}

/**
 * @returns {String}
 * @param {String} string
 */
function cleanString(string) {
    return string.replace(/[^A-z0-9\s]/g, "")
}

exports.cleanString = cleanString
