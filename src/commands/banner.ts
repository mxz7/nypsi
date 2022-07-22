import { CommandInteraction, GuildMember, Message } from "discord.js";
import { getMember } from "../utils/functions/member";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const banner = new Command("banner", "get a person's banner", Categories.INFO);

banner.setAliases(["bio"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const client = message.client;
    const guild = message.guild;
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

    const forcedMember = await client.users.fetch(member.user.id, { force: true });

    const banner = forcedMember.bannerURL();
    const accentColor = forcedMember.accentColor;

    let embed = new CustomEmbed(member).setHeader(forcedMember.tag);
    if (banner) {
        embed.setImage(`${forcedMember.bannerURL()}?size=2048`);
    } else if (accentColor) {
        embed.setColor(accentColor);
        embed.setDescription("this user's banner color is `" + forcedMember.hexAccentColor + "`");
    } else {
        return message.channel.send({ embeds: [new ErrorEmbed("this user doesn't have a banner/accent color")] });
    }

    return message.channel.send({ embeds: [embed] });
}

banner.setRun(run);

module.exports = banner;
