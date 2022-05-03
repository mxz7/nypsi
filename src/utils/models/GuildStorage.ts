export interface Countdown {
    date: number | Date
    format: string
    finalFormat: string
    channel: string
    id: number
}

export interface Case {
    case_id: string
    type: PunishmentType
    user: string
    moderator: string
    command: string
    time: number
    deleted: boolean | number
    guild_id: string
}

export enum PunishmentType {
    MUTE = "mute",
    BAN = "ban",
    UNMUTE = "unmute",
    WARN = "warn",
    KICK = "kick",
}

export interface CounterProfile {
    guild_id?: string
    enabled?: number | boolean
    format?: string
    filter_bots?: number | boolean
    channel?: string
}

export interface ChristmasProfile {
    guild_id?: string
    enabled?: number
    format?: string
    channel?: string
}
