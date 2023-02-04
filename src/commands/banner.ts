import { CommandInteraction, GuildMember, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getMember } from "../utils/functions/member";

const cmd = new Command("banner", "get a person's banner", "info");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  const banner = user.bannerURL({ size: 512 });

  const embed = new CustomEmbed(member).setHeader(member.user.tag).setImage(banner);

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
