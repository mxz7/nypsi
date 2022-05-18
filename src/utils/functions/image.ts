import { GuildMember, Webhook } from "discord.js"
import ImgurClient from "imgur"
import fetch from "node-fetch"
import { getDatabase } from "../database/database"
import { logger } from "../logger"

const db = getDatabase()

const imgur = new ImgurClient({
    // accessToken: process.env.IMGUR_ACCESSTOKEN,
    clientId: process.env.IMGUR_CLIENTID,
    clientSecret: process.env.IMGUR_CLIENTSECRET,
    refreshToken: process.env.IMGUR_REFRESHTOKEN,
})

declare function require(name: string)

let uploadDisabled = false

let uploadCount = 0
setInterval(() => {
    uploadCount = 0
    logger.info("imgur upload count reset")
}, 86400000)

let wholesomeWebhook: Webhook

let wholesomeCache: Array<{
    id: number
    image: string
    submitter: string
    submitter_id: string
    accepter: string
    upload: number
}>

export function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url)
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

/**
 * @returns {Boolean}
 * @param {GuildMember} submitter
 * @param {String} image
 */
export async function suggestWholesomeImage(submitter: GuildMember, image: string): Promise<boolean> {
    if (!wholesomeWebhook) {
        const { getGuild } = require("../../nypsi")
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

    const { requestDM } = require("../../nypsi")
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
export function getWholesomeImage(id?: number): {
    id: number
    image: string
    submitter: string
    submitter_id: string
    accepter: string
    upload: number
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
            logger.error("error occured uploading image to imgur")
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

    logger.info(`uploaded (${boobies.data.link})`)
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
