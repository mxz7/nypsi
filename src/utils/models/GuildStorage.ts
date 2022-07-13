export interface Case {
    case_id: string;
    type: PunishmentType;
    user: string;
    moderator: string;
    command: string;
    time: number;
    deleted: boolean | number;
    guild_id: string;
}

export enum PunishmentType {
    MUTE = "mute",
    BAN = "ban",
    UNMUTE = "unmute",
    WARN = "warn",
    KICK = "kick",
    UNBAN = "unban",
    FILTER_VIOLATION = "filter violation",
}
