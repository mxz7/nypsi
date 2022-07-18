import { Guild, User } from "discord.js";

export interface MilfSearchData {
    user: User;
    guild: Guild;
    channel: string;
    description: string;
    date: number;
}
