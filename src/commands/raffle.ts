import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("raffle", "select a random user all server members or from a specific role", Categories.FUN);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 5);

    let members: string[] = [];

    if (args.length == 0) {
        members = Array.from(message.guild.members.cache.keys());
    } else {
        const role = message.guild.roles.cache.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));

        if (!role) {
            return await message.channel.send({ embeds: [new ErrorEmbed("i wasn't able to find that role")] });
        }

        members = Array.from(role.members.keys());

        if (members.length == 0) {
            return message.channel.send({ embeds: [new ErrorEmbed("there is nobody in that role")] });
        }
    }

    const chosen = members[Math.floor(Math.random() * members.length)];

    const chosenMember = await message.guild.members.fetch(chosen);

    const embed = new CustomEmbed(message.member)
        .setHeader(`${message.member.user.username}'s raffle`, message.author.avatarURL())
        .setDescription(`${chosenMember.user.toString()} | \`${chosenMember.user.tag}\``);

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
