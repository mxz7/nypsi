import { Message, TextChannel, User } from "discord.js";
import { Item } from "./Economy";
import { CustomEmbed } from "./EmbedBuilders";

export interface RaceDetails {
    channel: TextChannel;
    users: Map<string, RaceUserDetails>;
    bet: number;
    message: Message;
    id: number;
    start: number;
    embed: CustomEmbed;
    started: boolean;
    speedLimit: number;
}

export interface RaceUserDetails {
    user: User;
    car: Item;
    position: number;
}
