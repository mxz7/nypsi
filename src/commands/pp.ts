import { CommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getItems } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("pp", "accurate prediction of your pp size", "fun").setAliases([
  "penis",
  "12inchmonster",
  "1inchwarrior",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("how big is your willy"),
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

  let size;
  let sizeMsg = "8";

  if (cache.has(member.user.id)) {
    size = cache.get(member.user.id);
  } else {
    size = Math.floor(Math.random() * 15);

    let chance = 45;

    if (await isPremium(member)) {
      if ((await getTier(member)) >= 3) {
        chance = 10;
      }
    }

    const bigInch = Math.floor(Math.random() * chance);

    if (bigInch == 7) {
      size = Math.floor(Math.random() * 55) + 15;
    }

    cache.set(member.user.id, size);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  const boosters = await getBoosters(message.member);

  for (const boosterId of boosters.keys()) {
    if (getItems()[boosterId].boosterEffect.boosts.includes("pp")) {
      size *= getItems()[boosterId].boosterEffect.effect;
    }
  }

  for (let i = 0; i < size; i++) {
    sizeMsg = sizeMsg + "=";
  }

  sizeMsg = sizeMsg + "D";

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n${sizeMsg}\n📏 ${size} ${pluralize("inch", size, "inches")}`,
  ).setHeader("pp predictor 1337", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);

  if (size < 5 && member.user.id === message.author.id) addTaskProgress(message.member, "pp_small");
  else if (size > 6 && member.user.id === message.author.id)
    addTaskProgress(message.member, "pp_big");
  else if (member.user.id === message.author.id) addTaskProgress(message.member, "pp");
}

cmd.setRun(run);

module.exports = cmd;
