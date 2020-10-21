const { GuildMember, Message } = require('discord.js');
const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")

/**
 * @returns {String}
 * @param {GuildMember} member member to get color of
 */
function getColor(member) {
    if (member.displayHexColor == "#ffffff") {
        return "#f8f8ff";
     } else {
         return member.displayHexColor;
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

        const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())

        if (link.gfyItem) {
            image = link.gfyItem.max5mbGif
            return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author
        }
    }

    let count = 0

    while (!isImageUrl(image)) {

        if (count >= 10) {
            console.log("couldnt find image @ " + post.data.subreddit_name_prefixed)
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

            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())

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

        for (char of a) {
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
function getMember(message, memberName) {
    if (!message.guild) return null
    let target = message.guild.members.cache.find(member => {
        if (member.user.tag.slice(0, -5).toLowerCase() == memberName.toLowerCase()) {
            return member;
        }
    });

    if (!target) {
        target = message.guild.members.cache.find(member => {
            return member.displayName.toLowerCase().includes(memberName.toLowerCase()) || member.user.tag.toLowerCase().includes(memberName.toLowerCase());
        });
    }

    if (!target) {
        target = message.guild.members.cache.find(member => {
            return member.user.id == memberName;
        });
    }

    return target;
}

exports.getMember = getMember

/**
 * @returns {String}
 * @param {Date} date 
 */
function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Intl.DateTimeFormat("en-US", options).format(date).toLowerCase().split(",").join("");
}

exports.formatDate = formatDate

/**
 * @returns {String}
 */
function getTimestamp() {
    const date = new Date();
    let hours = date.getHours().toString();
    let minutes = date.getMinutes().toString();
    let seconds = date.getSeconds().toString();
    
    if (hours.length == 1) {
        hours = "0" + hours;
    } 
    
    if (minutes.length == 1) {
        minutes = "0" + minutes;
    } 
    
    if (seconds.length == 1) {
        seconds = "0" + seconds;
    }
    
    const timestamp = hours + ":" + minutes + ":" + seconds;

    return timestamp
}

exports.getTimestamp = getTimestamp

/**
 * @returns {Number}
 * @param {Date} date 
 */
function daysAgo(date) {
    const ms = Math.floor(new Date() - date);

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

    return daysUntil(date).toString()
}

exports.daysUntilChristmas = daysUntilChristmas

/**
 * @returns {Number}
 * @param {Date} date 
 */
function daysUntil(date) {
    const ms = Math.floor(date - new Date());

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}

exports.daysUntil = daysUntil