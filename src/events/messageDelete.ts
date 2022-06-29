import { Message } from "discord.js";
import { snipe } from "../nypsi";
import { createGuild, getChatFilter, getSnipeFilter, hasGuild } from "../utils/guilds/utils";

export default async function messageDelete(message: Message) {
    if (!message) return;

    if (!message.member) return;

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
        if (!hasGuild(message.guild)) createGuild(message.guild);

        const filter = getSnipeFilter(message.guild);

        let content = message.content.toLowerCase().normalize("NFD");

        content = content.replace(/[^A-z0-9\s]/g, "");

        for (const word of filter) {
            if (content.includes(word.toLowerCase())) return;
        }

        const chatFilter = getChatFilter(message.guild);

        for (const word of chatFilter) {
            if (content.includes(word.toLowerCase())) return;
        }

        snipe.set(message.channel.id, {
            content: message.content,
            member: message.author.tag,
            createdTimestamp: message.createdTimestamp,
            memberAvatar: message.author.avatarURL(),
            channel: {
                id: message.channel.id,
            },
        });
    }
}
