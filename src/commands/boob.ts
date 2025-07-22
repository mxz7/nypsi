import { CommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, { msg: string; emoji: string }>();

const cmd = new Command("boob", "accurate prediction of your boob size", "fun").setAliases([
  "howbigaremyboobies",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("how big are your boobies"),
);

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

  const letters = ["AA", "A", "B", "C", "D", "DD"];

  let sizeMsg = "";
  let sizeEmoji = "";

  if (cache.has(member.user.id)) {
    sizeMsg = cache.get(member.user.id).msg;
    sizeEmoji = cache.get(member.user.id).emoji;
  } else {
    const size = Math.floor(Math.random() * 9) * 2 + 30;

    const index = Math.floor(Math.random() * letters.length);

    const letter = letters[index];

    if (index > 4) {
      sizeEmoji = "🍈";
    } else if (index > 2) {
      sizeEmoji = "🍒";
    } else {
      sizeEmoji = "🥞";
    }

    sizeMsg = `${size}${letter}`;

    cache.set(member.user.id, {
      msg: sizeMsg,
      emoji: sizeEmoji,
    });

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("boob calculator", member.user.avatarURL())
    .setDescription(member.user.toString() + `\n${sizeMsg}\n${sizeEmoji}`);

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
