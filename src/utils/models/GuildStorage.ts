export class Countdown {
    public date: Date | number
    public format: string
    public finalFormat: string
    public channel: string
    public id: string
    /**
     * @returns {Countdown}
     * @param {Date} date
     * @param {String} format
     * @param {String} finalFormat
     * @param {String} channel
     * @param {String} id
     */
    constructor(date: Date | number, format: string, finalFormat: string, channel: string, id: string) {
        this.date = date
        this.format = format
        this.finalFormat = finalFormat
        this.channel = channel
        this.id = id

        return this
    }
}

export interface Case {
    case_id: string
    type: PunishmentType
    user: string
    moderator: string
    command: string
    time: number
    deleted: boolean
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
    guild_id?: number
    enabled?: number,
    format?: string,
    filter_bots?: number,
    channel?: string
}