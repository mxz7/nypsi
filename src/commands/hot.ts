import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { addBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("hot", "measure how hot you are", "fun").setAliases(["howhot", "sexy"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("hot or not"));

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

    return send({ embeds: [embed], ephemeral: true });
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

  if (!(await userExists(member))) await createUser(member);

  let hotAmount;

  if (cache.has(member.user.id)) {
    hotAmount = cache.get(member.user.id);
  } else {
    hotAmount = Math.ceil(Math.random() * 101) - 1;

    cache.set(member.user.id, hotAmount);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  let hotText = "";
  let hotEmoji = "";

  if (hotAmount >= 95) {
    hotEmoji = "💰🍆💪😍😘";
    hotText =
      "HEY THERE what does it take to marry you. look. ill give you money. here. ive got big muscles too. im 6'2. please.";

    if (cache.has(member.user.id)) {
      cache.delete(member.user.id);
      await addBalance(member, 1069);
      addStat(member, "earned-hot", 1069);
    }
  } else if (hotAmount >= 80) {
    hotEmoji = "💍😍";
    hotText = "marry me wifey";
  } else if (hotAmount >= 60) {
    hotEmoji = "😳😏🥺";
    hotText = "hey there baby girl.. ahaha...";
  } else if (hotAmount >= 45) {
    hotEmoji = "😳😳🥺";
    hotText = "hey hey dam u kinda cute";
  } else if (hotAmount >= 35) {
    hotEmoji = "🥵";
    hotText = "whats ur sc";
  } else if (hotAmount >= 25) {
    hotEmoji = "🍆";
    hotText = "fuckable";
  } else if (hotAmount >= 15) {
    hotEmoji = "🤓";
    hotText = "nerd.";
  } else {
    hotEmoji = "🙄";
    hotText = "ugly.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${hotAmount}**% hot ${hotEmoji}\n${hotText}`,
  ).setHeader("hotness calculator", member.user.avatarURL());

  if (hotAmount >= 95) {
    embed.setFooter({ text: "+$1,069" });
  }

  await send({ embeds: [embed] });

  addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
