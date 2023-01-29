import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, { msg: string; emoji: string }>();

const cmd = new Command("boob", "accurate prediction of your boob size", Categories.FUN).setAliases(["howbigaremyboobies"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how big are your boobies"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 7);

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    if (!message.mentions.members.first()) {
      member = await getMember(message.guild, args[0]);
    } else {
      member = message.mentions.members.first();
    }

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

  addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
