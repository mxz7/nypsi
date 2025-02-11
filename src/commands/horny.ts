import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("horny", "measure how horny you are", "fun").setAliases([
  "howhorny",
  "fuckmedaddy",
  "makemecum",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how horny are u"));

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
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

  let hornyAmount;

  if (cache.has(member.user.id)) {
    hornyAmount = cache.get(member.user.id);
  } else {
    hornyAmount = Math.ceil(Math.random() * 101) - 1;

    cache.set(member.user.id, hornyAmount);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  let hornyText = "";
  let hornyEmoji = "";

  if (hornyAmount >= 95) {
    hornyEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
    hornyText = "FUCK ME NOW. DADDY.";
  } else if (hornyAmount >= 80) {
    hornyEmoji = "🍆💦🤤";
    hornyText = "hey let me help you pleaseeee";
  } else if (hornyAmount >= 60) {
    hornyEmoji = "🍆✊ 😼👈";
    hornyText = "hehe u kinda turning me on";
  } else if (hornyAmount >= 45) {
    hornyEmoji = "😏🍆";
    hornyText = "i see your incognito tab";
  } else if (hornyAmount >= 35) {
    hornyEmoji = "👉👌";
    hornyText = "dirty thoughts";
  } else if (hornyAmount >= 25) {
    hornyEmoji = "🍆";
    hornyText = "hehe u can do better than that";
  } else if (hornyAmount >= 15) {
    hornyEmoji = "😐";
    hornyText = "cum on man.";
  } else {
    hornyEmoji = "🙄";
    hornyText = "ur so innocent. boring.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${hornyAmount}**% horny ${hornyEmoji}\n${hornyText}`,
  ).setHeader("horny calculator", member.user.avatarURL());

  await send({ embeds: [embed] });

  addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
