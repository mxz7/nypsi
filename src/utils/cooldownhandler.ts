import { GuildMember } from "discord.js"
import redis from "./database/redis"
import { ErrorEmbed } from "./models/EmbedBuilders"
import { getTier, isPremium } from "./premium/utils"

export async function onCooldown(cmd: string, member: GuildMember): Promise<boolean> {
    const key = `cd:${cmd}:${member.user.id}`

    const res = await redis.exists(key)

    return res == 1 ? true : false
}

export async function addCooldown(cmd: string, member: GuildMember, seconds: number) {
    const key = `cd:${cmd}:${member.user.id}`

    const expire = calculateCooldownLength(seconds, member)

    console.log(expire)

    await redis.lpush(key, Date.now(), seconds)
    await redis.expire(key, expire)
}

export async function getResponse(cmd: string, member: GuildMember): Promise<ErrorEmbed> {
    const key = `cd:${cmd}:${member.user.id}`
    const cd = await redis.lrange(key, 0, -1)

    const init = parseInt(cd[1])
    const length = parseInt(cd[0])

    const diff = (Date.now() - init) / 1000
    const time = length - diff

    const minutes = Math.floor(time / 60)
    const seconds = (time - minutes * 60).toFixed(1)

    let remaining: string

    if (minutes != 0) {
        remaining = `${minutes}m${seconds}s`
    } else {
        remaining = `${seconds}s`
    }

    return new ErrorEmbed(`you are on cooldown for \`${remaining}\``)
}

function calculateCooldownLength(seconds: number, member: GuildMember): number {
    if (isPremium(member)) {
        if (getTier(member) == 4) {
            return Math.round(seconds * 0.25)
        } else {
            return Math.round(seconds * 0.5)
        }
    }
}
