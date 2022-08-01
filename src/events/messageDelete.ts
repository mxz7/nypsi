import { Message } from "discord.js";
import { createGuild, getChatFilter, getSnipeFilter, hasGuild, snipe } from "../utils/guilds/utils";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { LogType } from "../utils/models/GuildStorage";
import { addLog, isLogsEnabled } from "../utils/moderation/utils";

export default async function messageDelete(message: Message) {
    if (!message) return;

    if (!message.member) return;

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
        if (!(await hasGuild(message.guild))) await createGuild(message.guild);

        if (await isLogsEnabled(message.guild)) {
            const embed = new CustomEmbed().disableFooter().setTimestamp();

            embed.setHeader("message deleted");
            embed.setDescription(
                `${message.member.toString()} \`${message.author.id}\`\n\n**channel** ${message.channel.toString()} \`${
                    message.channelId
                }\``
            );
            embed.addField("content", `\`${message.content}\``);

            await addLog(message.guild, LogType.MESSAGE, embed);
        }

        const filter = await getSnipeFilter(message.guild);

        let content = message.content.toLowerCase().normalize("NFD");

        content = content.replace(/[^A-z0-9\s]/g, "");

        for (const word of filter) {
            if (content.includes(word.toLowerCase())) return;
        }

        const chatFilter = await getChatFilter(message.guild);

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
