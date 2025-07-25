import { CommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("gay", "very accurate gay level calculator", "fun").setAliases([
  "howgay",
  "lgbtdetector",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are u gay"));

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));

    if (!member) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  let gayAmount;

  if (cache.has(member.user.id)) {
    gayAmount = cache.get(member.user.id);
  } else {
    gayAmount = Math.ceil(Math.random() * 101) - 1;

    cache.set(member.user.id, gayAmount);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  let gayText = "";
  let gayEmoji = "";

  if (gayAmount >= 70) {
    gayEmoji = ":rainbow_flag:";
    gayText = "dam hmu 😏";
  } else if (gayAmount >= 45) {
    gayEmoji = "🌈";
    gayText = "good enough 😉";
  } else if (gayAmount >= 20) {
    gayEmoji = "👫";
    gayText = "kinda straight 😐";
  } else {
    gayEmoji = "📏";
    gayText = "thought we coulda had smth 🙄";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${gayAmount}**% gay ${gayEmoji}\n${gayText}`,
  ).setHeader("gay calculator", member.user.avatarURL());

  await send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
