import { CommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("iq", "accurate prediction of your iq", "fun");

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("how large is your iq"),
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

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));

    if (!member) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  await addCooldown(cmd.name, message.member, 5);

  let iq;
  let iqMsg;

  if (cache.has(member.user.id)) {
    iq = cache.get(member.user.id);
  } else {
    let chanceAmount = 25;

    if (await isPremium(member)) {
      if ((await getTier(member)) >= 3) {
        chanceAmount = 10;
      }
    }

    const chance = Math.floor(Math.random() * chanceAmount);

    if (chance == 7) {
      const chance2 = Math.floor(Math.random() * 10);

      if (chance2 > 5) {
        iq = Math.floor(Math.random() * 20);
      } else {
        iq = (Math.floor(Math.random() * 8) + 2) * 100;
      }
    } else if (chance == 6) {
      iq = 69;
    } else if (chance == 5) {
      iq = 420;
    } else {
      iq = Math.floor(Math.random() * 40) + 80;
    }

    cache.set(member.user.id, iq);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  if (iq == 69) {
    iqMsg = "😉😏🍆🍑";
  } else if (iq < 80) {
    iqMsg = "you're a rock :rock:";
  } else if (iq < 90) {
    iqMsg = "u probably push doors that say pull";
  } else if (iq < 98) {
    iqMsg = "dumbass.. 🤣";
  } else if (iq < 103) {
    iqMsg = "average 🙄";
  } else if (iq < 120) {
    iqMsg = "big brain";
  } else if (iq < 400) {
    iqMsg = "nerd 🤓";
  } else if (iq == 420) {
    iqMsg = "🚬🍁🍂";
  } else {
    iqMsg = "uh. woah.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n\n**${iq}** IQ 🧠\n${iqMsg}`,
  ).setHeader("iq calculator", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
