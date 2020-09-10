const { MessageEmbed } = require("discord.js");
const fetch = require("node-fetch")
const { getColor } = require("../utils/utils");
const { hypixel } = require("../config.json")

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

module.exports = {
    name: "hypixel",
    description: "view hypixel stats for a minecraft account",
    category: "info",
    aliases: ["h"],
    run: async (message, args) => {

        if (args.length == 0) {
            return message.channel.send("❌ $h <username> (sw/bw)");
        }

        const color = getColor(message.member)

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
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
                console.log(e)
                return message.channel.send("❌ invalid account");
            }
    
            const hypixelURL = `https://api.hypixel.net/player?uuid=${uuid.id}&key=${hypixel}`
    
            try {
                hypixelData = await fetch(hypixelURL).then(hypixelData => hypixelData.json())
            } catch {
                console.log(e)
                return await message.channel.send("❌ error fetching data")
            }
    
            if (!hypixelData.success) {
                return await message.channel.send("❌ error fetching data")
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
        const skin = `https://mc-heads.net/avatar/${uuid.id}`

        let lastLog = timeSince(new Date(hypixelData.player.lastLogin))

        if (lastLog == 0) {
            lastLog = "today`"
        } else {
            lastLog = lastLog + "` days ago"
        }

        const firstLog = new Date(hypixelData.player.firstLogin).toLocaleString().split(", ")[0]
        const level = getLevel(hypixelData.player.networkExp)

        let rank = ranks.get(hypixelData.player.newPackageRank)

        if (!rank) rank = "Default"

        if (hypixelData.player.monthlyPackageRank == "SUPERSTAR") rank = "MVP++"

        let streak = hypixelData.player.rewardStreak

        if (!streak) {
            streak = 0
        } else {
            streak = streak.toLocaleString()
        }

        let topStreak = hypixelData.player.rewardHighScore.

        if (!topStreak) {
            topStreak = 0
        } else {
            topStreak = topStreak.toLocaleString()
        }

        const karma = hypixelData.player.karma.toLocaleString()

        let challenges = hypixelData.player.challenges.all_time

        await Object.entries(challenges).forEach(c => {
            if (!parseInt(challenges)) {
                challenges = 0
            }

            challenges = challenges + c[1]
        })

        challenges = challenges.toLocaleString()
        const quests = hypixelData.player.achievements.general_quest_master.toLocaleString()

        const embed = new MessageEmbed()
            .setTitle("[" + rank + "] " + uuid.name)
            .addField("first login date", "`" + firstLog + "`", true)
            .addField("logged in", "`" + lastLog, true)
            .addField("streak ~ highest", "`" + streak + " ~ " + topStreak + "`", true)
            .addField("level", "`" + level.toLocaleString() + "`", true)
            .addField("karma", "`" + karma + "`", true)
            .addField("quests ~ challenges", "`" + quests + " ~ " + challenges + "`", true)
            .setURL(url)
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setThumbnail(skin)

        return await message.channel.send(embed)
    }
}

function getLevel(exp) {
    return exp < 0 ? 1 : Math.floor(1 + REVERSE_PQ_PREFIX + Math.sqrt(REVERSE_CONST + GROWTH_DIVIDES_2 * exp))
}

function timeSince(date) {
    const ms = Math.floor((new Date() - date));

    const days = Math.floor(ms / (24 * 60 * 60 * 1000))

    return days
}