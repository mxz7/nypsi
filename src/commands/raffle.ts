import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("raffle", "select a random user all server members or from a specific role", Categories.FUN);

/**
 * @param {Message} message
 * @param {string[]} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 5);

    const members = [];

    if (args.length == 0) {
        const members1 = message.guild.members.cache;

        members1.forEach((m) => {
            if (!m.user.bot) {
                if (members.indexOf(m.user.id) == -1) {
                    members.push(m.user.id);
                }
            }
        });
    } else {
        const role = message.guild.roles.cache.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));

        if (!role) {
            return await message.channel.send({ embeds: [new ErrorEmbed("i wasn't able to find that role")] });
        }

        role.members.forEach((m) => {
            members.push(m.user.id);
        });

        if (members.length == 0) {
            return message.channel.send({ embeds: [new ErrorEmbed("there is nobody in that role")] });
        }
    }

    let chosen = members[Math.floor(Math.random() * members.length)];

    chosen = await message.guild.members.fetch(chosen);

    const embed = new CustomEmbed(message.member)
        .setHeader(`${message.member.user.username}'s raffle`, message.author.avatarURL())
        .setDescription(`${chosen.user.toString()} | \`${chosen.user.tag}\``);

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
