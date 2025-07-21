import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import { getMember } from "../utils/functions/member";

const cmd = new Command("karma", "check how much karma you have", "money").setDocs(
  "https://nypsi.xyz/docs/economy/karma?ref=bot-help",
);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("user to get karma of"),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
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

  embed.setFooter({ text: `whats karma? do ${(await getPrefix(message.guild))[0]}karmahelp` });

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
