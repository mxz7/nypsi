import { CommandInteraction, GuildMember } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getMember } from "../utils/functions/member";

const cmd = new Command("banner", "get a person's banner", "info");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const user = await message.client.users.fetch(member.user.id, { force: true });

  if (!user.banner) {
    return message.channel.send({ embeds: [new ErrorEmbed(`${member == message.member ? "you do" : `${user.username} does`} not have a banner`)] });
  }

  const banner = user.bannerURL({ size: 512 });

  const embed = new CustomEmbed(member).setHeader(member.user.username).setImage(banner);

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
