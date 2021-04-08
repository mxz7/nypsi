const { GuildMember, Message } = require("discord.js")
const isImageUrl = require("is-image-url")
const fetch = require("node-fetch")
const { getZeroWidth } = require("./classes/ChatReaction")
const { error } = require("./logger")

const news = {
    text: "",
    date: new Date().getTime(),
}

const locked = []

/**
 * @returns {String}
 * @param {GuildMember} member member to get color of
 */
function getColor(member) {
    if (member.displayHexColor == "#ffffff") {
        return "#f8f8ff"
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
        const link = await fetch(
            "https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]
        ).then((url) => url.json())

        if (link.gfyItem) {
            image = link.gfyItem.max5mbGif
            return (
                image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
            )
        }
    }

    let count = 0

    while (!isImageUrl(image)) {
        if (count >= 10) {
            error("couldnt find image @ " + post.data.subreddit_name_prefixed)
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
                return (
                    image +
                    "|" +
                    post.data.title +
                    "|" +
                    post.data.permalink +
                    "|" +
                    post.data.author
                )
            }
        }

        if (image.includes("gfycat")) {
            const link = await fetch(
                "https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]
            ).then((url) => url.json())

            if (link) {
                image = link.gfyItem.max5mbGif
                return (
                    image +
                    "|" +
                    post.data.title +
                    "|" +
                    post.data.permalink +
                    "|" +
                    post.data.author
                )
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

    if (
        message.guild.memberCount == message.guild.members.cache.size &&
        message.guild.memberCount <= 25
    ) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()
    }

    let target
    let possible = new Map()

    for (let member of members.keyArray()) {
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

    if (
        message.guild.memberCount == message.guild.members.cache.size &&
        message.guild.memberCount <= 25
    ) {
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
 * @returns {captcha}
 */
function createCaptcha() {
    return new captcha(Math.floor(Math.random() * 16777215).toString(16))
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