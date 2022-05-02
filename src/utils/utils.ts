import dayjs = require("dayjs")
import { Client, Collection, Guild, GuildMember, Message, Webhook } from "discord.js"
import { ImgurClient } from "imgur"
import { getZeroWidth } from "./chatreactions/utils"
import { getDatabase } from "./database/database"
import { logger } from "./logger"

declare function require(name: string)

const db = getDatabase()

const imgur = new ImgurClient({
    // accessToken: process.env.IMGUR_ACCESSTOKEN,
    clientId: process.env.IMGUR_CLIENTID,
    clientSecret: process.env.IMGUR_CLIENTSECRET,
    refreshToken: process.env.IMGUR_REFRESHTOKEN,
})

let uploadDisabled = false

let uploadCount = 0
setInterval(() => {
    uploadCount = 0
    logger.info("imgur upload count reset")
}, 86400000)

interface News {
    text: string
    date: number
}

const news: News = {
    text: "",
    date: new Date().getTime(),
}

const locked: Array<string> = []

let wholesomeWebhook: Webhook

let wholesomeCache: Array<{
    id: number
    image: string
    submitter: string
    submitter_id: string
    accepter: string
    date: Date
}>

export function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url)
}

export function getColor(member: GuildMember) {
    if (member.displayHexColor == "#ffffff") {
        return "#111111"
    } else {
        return member.displayHexColor
    }
}

export async function redditImage(post: any, allowed: any): Promise<string> {
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

        for (const char of a) {
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

export async function getMember(guild: Guild, memberName: string): Promise<GuildMember> {
    if (!guild) return null

    let members: Collection<string, GuildMember>

    if (guild.memberCount == guild.members.cache.size && guild.memberCount <= 25) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    let target: GuildMember
    const possible = new Map()

    for (const m of members.keys()) {
        const member = members.get(m)

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

/**
 *
 * @param {Message} guild
 * @param {String} memberName
 */
export async function getExactMember(guild: Guild, memberName: string): Promise<GuildMember> {
    if (!guild) return null

    let members: Collection<string, GuildMember>

    if (guild.memberCount == guild.members.cache.size && guild.memberCount <= 25) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    const target = members.find(
        (member) =>
            member.user.username.toLowerCase() == memberName.toLowerCase() ||
            member.user.tag.toLowerCase() == memberName.toLowerCase() ||
            member.user.id == memberName
    )

    return target
}

/**
 * @returns {String}
 * @param {Date} date
 */
export function formatDate(date: Date | number): string {
    return dayjs(date).format("MMM D YYYY").toLowerCase()
}

export function daysAgo(date: Date | number): number {
    date = new Date(date)
    const ms = Math.floor(Date.now() - date.getTime())

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

/**
 * @returns {String}
 */
export function daysUntilChristmas(): string {
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

export function daysUntil(date: Date | number): number {
    date = new Date(date)
    const ms = Math.floor(date.getTime() - Date.now())

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

export function MStoTime(ms: number) {
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

/**
 * @returns {String}
 */
export function getNews(): News {
    return news
}

export function setNews(string: string) {
    news.text = string
    news.date = new Date().getTime()
}

/**
 *
 * @param {String} string user id
 * @returns {Boolean}
 */
export function isLockedOut(string: string): boolean {
    if (locked.indexOf(string) == -1) {
        return false
    } else {
        return true
    }
}

/**
 *
 * @param {String} string user id
 */
export function toggleLock(string: string) {
    if (isLockedOut(string)) {
        locked.splice(locked.indexOf(string), 1)
    } else {
        locked.push(string)
    }
}

export async function showTopGlobalBal(client: Client) {
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

        const channel = guild.channels.cache.find((ch) => ch.id == "833052442069434429")

        if (!channel) {
            return logger.error("UNABLE TO FIND CHANNEL FOR GLOBAL BAL TOP")
        }

        if (channel.type != "GUILD_TEXT") return

        const baltop = await topAmountGlobal(10, client, true)

        const embed = new CustomEmbed()

        embed.setTitle("top 10 richest users")
        embed.setDescription(baltop.join("\n"))
        embed.setColor("#111111")

        await channel.send({ embeds: [embed] })
        logger.log({
            level: "auto",
            message: "sent global bal top",
        })
    }

    setTimeout(async () => {
        setInterval(() => {
            postGlobalBalTop()
        }, 86400000)
        postGlobalBalTop()
    }, needed.getTime() - now.getTime())

    logger.log({
        level: "auto",
        message: `global bal top will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    })
}

/**
 * @returns {captcha}
 */
export function createCaptcha(): captcha {
    return new captcha(Math.random().toString(36).substr(2, 7))
}

class captcha {
    public answer: string
    public display: string
    /**
     *
     * @param {String} d random letters
     * @returns {captcha}
     */
    constructor(d: string) {
        this.answer = d

        const zeroWidthCount = d.length / 2

        const zeroWidthChar = getZeroWidth()

        let displayWord = d

        for (let i = 0; i < zeroWidthCount; i++) {
            const pos = Math.floor(Math.random() * d.length + 1)

            displayWord = displayWord.substring(0, pos) + zeroWidthChar + displayWord.substring(pos)
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
export async function suggestWholesomeImage(submitter: GuildMember, image: string): Promise<boolean> {
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

/**
 * @returns {Boolean}
 * @param {Number} id
 * @param {GuildMember} accepter
 */
export function acceptWholesomeImage(id: number, accepter: GuildMember): boolean {
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

/**
 * @returns {Boolean}
 * @param {Number} id
 */
export function denyWholesomeImage(id: number): boolean {
    const query = db.prepare("SELECT * FROM wholesome_suggestions WHERE id = ?").get(id)

    if (!query) return false

    db.prepare("DELETE FROM wholesome_suggestions WHERE id = ?").run(id)

    return true
}

/**
 * @returns {{ id: Number, image: String, submitter: String, submitter_id: String, accepter: String, date: Date }}
 * @param {id} Number
 */
export function getWholesomeImage(id): {
    id: number
    image: string
    submitter: string
    submitter_id: string
    accepter: string
    date: Date
} {
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

export function clearWholesomeCache() {
    wholesomeCache = undefined
}

/**
 * @returns {Boolean}
 * @param {Number} id
 */
export function deleteFromWholesome(id: number): boolean {
    const query = db.prepare("DELETE FROM wholesome WHERE id = ?").run(id)

    clearWholesomeCache()

    if (query.changes > 0) {
        return true
    } else {
        return false
    }
}

/**
 * @returns {{Array<{ id: Number, image: String, submitter: String, submitter_id: String, date: Date }>}}
 */
export function getAllSuggestions(): Array<{
    id: number
    image: string
    submitter: string
    submitter_id: string
    date: number
}> {
    const query = db.prepare("SELECT * FROM wholesome_suggestions").all()

    return query
}

/**
 * @returns {String}
 * @param {String} url
 */
export async function uploadImageToImgur(url: string): Promise<string> {
    let fallback = false

    if (uploadCount >= 775) fallback = true
    if (uploadDisabled) fallback = true
    let fail = false

    logger.info(`uploading ${url}`)
    const boobies: any = await imgur
        .upload({
            image: url,
        })
        .catch((e) => {
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
    return boobies.data.link
}

async function fallbackUpload(url: string) {
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
export function cleanString(string: string): string {
    return string.replace(/[^A-z0-9\s]/g, "")
}
