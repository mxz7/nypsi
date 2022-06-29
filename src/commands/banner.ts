import { CommandInteraction, GuildMember, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { getMember } from "../utils/functions/member";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("banner", "get a person's banner", Categories.INFO);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let member: GuildMember;

    if (args.length == 0) {
        member = message.member;
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "));
        } else {
            member = message.mentions.members.first();
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const user = await message.client.users.fetch(member.user.id, { force: true });

    const banner = user.bannerURL({ dynamic: true, size: 512 });

    const embed = new CustomEmbed(member, false).setHeader(member.user.tag).setImage(banner);

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
