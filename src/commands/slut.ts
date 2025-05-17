import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("slut", "measure how much of a slut you are", "fun").setAliases([
  "howslut",
  "whore",
  "cumslut",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are you slutty 😳"));

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

  let slutAmount;

  if (cache.has(member.user.id)) {
    slutAmount = cache.get(member.user.id);
  } else {
    slutAmount = Math.ceil(Math.random() * 101) - 1;

    cache.set(member.user.id, slutAmount);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  let slutText = "";
  let slutEmoji = "";

  if (slutAmount >= 95) {
    slutEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
    slutText = "whore ass hooker cumslut cousin fucker sweet home alabama";
  } else if (slutAmount >= 80) {
    slutEmoji = "🍆🍒🍑😈 👉👌";
    slutText = "pornhub and onlyfans is your family business";
  } else if (slutAmount >= 60) {
    slutEmoji = "🍆👉👌💦";
    slutText = "took 12 loads in one sitting";
  } else if (slutAmount >= 45) {
    slutEmoji = "👉👌💦";
    slutText = "princess cumslut";
  } else if (slutAmount >= 35) {
    slutEmoji = "🍆✊";
    slutText = "you would fuck anyone";
  } else if (slutAmount >= 25) {
    slutEmoji = "🍆🧎‍♂️";
    slutText = "still a whore";
  } else if (slutAmount >= 15) {
    slutEmoji = "🍑";
    slutText = "average 🙄";
  } else {
    slutEmoji = "🤐";
    slutText = "virgin";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${slutAmount}**% slut ${slutEmoji}\n${slutText}`,
  ).setTitle("slut calculator");

  addProgress(message.author.id, "unsure", 1);

  return await send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
