import { GuildMember } from "discord.js"
import redis from "./database/redis"
import { getPrefix } from "./guilds/utils"
import { ErrorEmbed } from "./models/EmbedBuilders"
import { getTier, isPremium } from "./premium/utils"

export async function onCooldown(cmd: string, member: GuildMember): Promise<boolean> {
    const key = `cd:${cmd}:${member.user.id}`

    const res = await redis.exists(key)

    return res == 1 ? true : false
}

export async function addCooldown(cmd: string, member: GuildMember, seconds?: number) {
    const key = `cd:${cmd}:${member.user.id}`

    let expireDisabled = false

    if (!seconds) {
        expireDisabled = true
        seconds = 69420
    }

    const expire = calculateCooldownLength(seconds, member)

    const data: CooldownData = {
        date: Date.now(),
        length: expire,
    }

    await redis.set(key, JSON.stringify(data))
    if (!expireDisabled) await redis.expire(key, expire)
}

export async function addExpiry(cmd: string, member: GuildMember, seconds: number) {
    const key = `cd:${cmd}:${member.user.id}`

    const expire = calculateCooldownLength(seconds, member)

    const data: CooldownData = {
        date: Date.now(),
        length: expire,
    }

    await redis.set(key, JSON.stringify(data))
    await redis.expire(key, expire)
}

export async function getResponse(cmd: string, member: GuildMember): Promise<ErrorEmbed> {
    const key = `cd:${cmd}:${member.user.id}`
    const cd: CooldownData = JSON.parse(await redis.get(key))

    if (!cd) {
        return new ErrorEmbed("you are on cooldown for `0.1s`").removeTitle()
    }

    const init = cd.date
    const length = cd.length

    const diff = (Date.now() - init) / 1000
    const time = length - diff

    const minutes = Math.floor(time / 60)
    const seconds = (time - minutes * 60).toFixed(1)

    let remaining: string

    if (minutes != 0) {
        remaining = `${minutes}m${Math.floor(parseFloat(seconds))}s`
    } else {
        remaining = `${seconds}s`
    }

    const embed = new ErrorEmbed(`you are on cooldown for \`${remaining}\``).removeTitle()

    const random = Math.floor(Math.random() * 50)

    if (random == 7 && !isPremium(member)) {
        embed.setFooter(`premium members get 50% shorter cooldowns (${getPrefix(member.guild)}donate)`)
    }

    return embed
}

function calculateCooldownLength(seconds: number, member: GuildMember): number {
    if (isPremium(member)) {
        if (getTier(member) == 4) {
            return Math.round(seconds * 0.25)
        } else {
            return Math.round(seconds * 0.5)
        }
    } else {
        return seconds
    }
}

interface CooldownData {
    date: number
    length: number
}
