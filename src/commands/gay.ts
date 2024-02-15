import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("gay", "very accurate gay level calculator", "fun").setAliases([
  "howgay",
  "lgbtdetector",
]);


async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 7);

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

  addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
