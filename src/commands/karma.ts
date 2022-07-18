import { CommandInteraction, Message } from "discord.js";
import { getMember } from "../utils/functions/member";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getKarma, removeKarma } from "../utils/karma/utils";
import { getPrefix } from "../utils/guilds/utils";

const cmd = new Command("karma", "check how much karma you have", Categories.INFO);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    let target = message.member;

    if (args.length >= 1) {
        if (message.author.id == "672793821850894347" && args[0] == "remove") {
            if (!args[1] || !args[2]) {
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, "$karma remove <userid> <amount>")],
                });
            }

            await removeKarma(args[1], parseInt(args[2]));
        }
        target = message.mentions.members.first();

        if (!target) {
            target = await getMember(message.guild, args.join(" "));
        }

        if (!target) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
        }
    }

    const karma = await getKarma(target);

    const embed = new CustomEmbed(message.member);

    if (target.user.id == message.author.id) {
        embed.setHeader("your karma", message.author.avatarURL());
        embed.setDescription(`you have **${karma.toLocaleString()}** karma 🔮`);
    } else {
        embed.setHeader(`${target.user.username}'s karma`, target.user.avatarURL());
        embed.setDescription(`${target.user.username} has **${karma.toLocaleString()}** karma 🔮`);
    }

    embed.setFooter({ text: `whats karma? do ${await getPrefix(message.guild)}karmahelp` });

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
