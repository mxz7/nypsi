import { CommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, { content: string; emoji: string }>();

const values = [
  { content: "flat as a pancake.", emoji: "🥞" },
  { content: "HOLLYYYYYY LAY THAT THING ON MY FACE RIGHT NOW", emoji: "🍑" },
  { content: "i bet it jiggles", emoji: "🍑" },
  { content: "can i spank it?", emoji: "🍑👋" },
  { content: "dump truck", emoji: "🍑" },
  { content: "damn you're an ironing board", emoji: "😹🫵" },
  { content: "volumptuous", emoji: "🍑" },
  { content: "I WANNA EAT IT", emoji: "🍑😋" },
  { content: "let me bite.", emoji: "🍑🤤" },
  { content: "hahahahhahha there's nothing there", emoji: "😹🫵" },
];

const cmd = new Command("ass", "accurate prediction of your ass size", "fun").setAliases([
  "butt",
  "bum",
  "booty",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("how big is your ass"),
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

  await addCooldown(cmd.name, message.member, 3);

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));

    if (!member) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  let value: { content: string; emoji: string };

  if (cache.has(member.user.id)) {
    value = cache.get(member.user.id);
  } else {
    value = values[Math.floor(Math.random() * values.length)];
    cache.set(member.user.id, value);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("ass determiner", member.user.avatarURL())
    .setDescription(member.user.toString() + `\n${value.emoji} ${value.content}`);

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
