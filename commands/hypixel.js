const { Message } = require("discord.js");
const fetch = require("node-fetch")
const { hypixel } = require("../config.json");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()
const cache = new Map()

const BASE = 10_000
const GROWTH = 2_500
const REVERSE_PQ_PREFIX = -(BASE - 0.5 * GROWTH) / GROWTH;
const REVERSE_CONST = REVERSE_PQ_PREFIX * REVERSE_PQ_PREFIX
const GROWTH_DIVIDES_2 = 2 / GROWTH

const ranks = new Map()

ranks.set("MVP_PLUS", "MVP+")
ranks.set("MVP", "MVP")
ranks.set("VIP_PLUS", "VIP+")
ranks.set("VIP", "VIP")

const cmd = new Command("hypixel", "view hypixel stats for a minecraft account", categories.INFO).setAliases(["h"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (args.length == 0) {
        return message.channel.send("❌ $h <username>");
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 10000);

    const username = args[0]
    
    let uuid
    let hypixelData

    if (cache.has(username.toLowerCase())) {
        hypixelData = cache.get(username.toLowerCase()).hypixel
        uuid = cache.get(username.toLowerCase()).mojang
    } else {
        const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username

        try {
            uuid = await fetch(uuidURL).then(uuidURL => uuidURL.json())
        } catch (e) {
            return message.channel.send(new ErrorEmbed("invalid account"));
        }

        const hypixelURL = `https://api.hypixel.net/player?uuid=${uuid.id}&key=${hypixel}`

        try {
            hypixelData = await fetch(hypixelURL).then(hypixelData => hypixelData.json())
        } catch {
            console.log(e)
            return await message.channel.send(new ErrorEmbed("error fetching data"))
        }

        if (!hypixelData.success) {
            return await message.channel.send(new ErrorEmbed("error fetching data"))
        }

        cache.set(username.toLowerCase(), {
            hypixel: hypixelData,
            mojang: uuid
        })

        setTimeout(() => {
            cache.delete(username.toLowerCase())
        }, 1800000)
    }

    const url = "https://plancke.io/hypixel/player/stats/" + uuid.id
    const skin = `https://mc-heads.net/avatar/${uuid.id}/256`

    let lastLog, firstLog, level, rank, streak, topStreak, karma, challenges, quests

    try {
        lastLog = timeSince(new Date(hypixelData.player.lastLogin))
        firstLog = new Date(hypixelData.player.firstLogin).toLocaleString().split(", ")[0]
        level = getLevel(hypixelData.player.networkExp)
        rank = ranks.get(hypixelData.player.newPackageRank)
        streak = hypixelData.player.rewardStreak
        topStreak = hypixelData.player.rewardHighScore
        karma = hypixelData.player.karma
        challenges = hypixelData.player.challenges
        quests = hypixelData.player.achievements.general_quest_master

        if (lastLog == 0) {
            lastLog = "today`"
        } else {
            lastLog = lastLog + "` days ago"
        }

        if (!rank) rank = "Default"

        if (hypixelData.player.monthlyPackageRank == "SUPERSTAR") rank = "MVP++"

        if (!streak) {
            streak = 0
        } else {
            streak = streak.toLocaleString()
        }

        if (!topStreak) {
            topStreak = 0
        } else {
            topStreak = topStreak.toLocaleString()
        }

        if (!karma) karma = 0

        karma = karma.toLocaleString()

        if (!challenges) {
            challenges = 0
        } else {
            challenges = hypixelData.player.challenges.all_time
        }

        await Object.entries(challenges).forEach(c => {
            if (!parseInt(challenges)) {
                challenges = 0
            }

            challenges = challenges + c[1]
        })

        challenges = challenges.toLocaleString()

        if (!quests) {
            quests = 0
        } else {
            quests = quests.toLocaleString()
        }
    } catch {
        if (cache.has(username.toLowerCase())) {
            cache.delete(username.toLowerCase())
        }
        return message.channel.send(new ErrorEmbed("error reading hypixel data"))
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle("[" + rank + "] " + uuid.name)
        .addField("first login date", "`" + firstLog + "`", true)
        .addField("logged in", "`" + lastLog, true)
        .addField("streak ~ highest", "`" + streak + " ~ " + topStreak + "`", true)
        .addField("level", "`" + level.toLocaleString() + "`", true)
        .addField("karma", "`" + karma + "`", true)
        .addField("quests ~ challenges", "`" + quests + " ~ " + challenges + "`", true)
        .setURL(url)
        .setThumbnail(skin)

    return await message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd

function getLevel(exp) {
    return exp < 0 ? 1 : Math.floor(1 + REVERSE_PQ_PREFIX + Math.sqrt(REVERSE_CONST + GROWTH_DIVIDES_2 * exp))
}

function timeSince(date) {
    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}