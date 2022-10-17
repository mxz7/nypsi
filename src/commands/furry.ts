import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getXp, updateXp } from "../utils/functions/economy/xp.js";
import { getMember } from "../utils/functions/member.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cache = new Map<string, number>();

const cmd = new Command("furry", "measure how much of a furry you are", Categories.FUN).setAliases([
  "howfurry",
  "stfufurry",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("is this dude a furry"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
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

  if (!(await userExists(member))) await createUser(member);

  let furryAmount;

  if (cache.has(member.user.id)) {
    furryAmount = cache.get(member.user.id);
  } else {
    furryAmount = Math.ceil(Math.random() * 101) - 1;

    cache.set(member.user.id, furryAmount);

    setTimeout(() => {
      if (cache.has(member.user.id)) {
        cache.delete(member.user.id);
      }
    }, 60 * 1000);
  }

  let furryText = "";
  let furryEmoji = "";

  if (furryAmount >= 85) {
    furryEmoji = "🐶🍆💦🧎‍♂️😋";
    furryText = "fucking cumfurry bet u work at a doggy daycare";
  } else if (furryAmount >= 70) {
    furryEmoji = "🐱🍆💦💦";
    furryText = "you've got a furry suit collection and go to cosplay conventions";
  } else if (furryAmount >= 50) {
    furryEmoji = "👉🐈💦";
    furryText = "stop looking at the cat";
  } else if (furryAmount >= 30) {
    furryEmoji = "💻🐕🐩";
    furryText = "i've seen your search history...";
  } else if (furryAmount >= 25) {
    furryEmoji = "😾";
    furryText = "STOP DONT DO IT DONT BUY THE FURRY SUIT";
  } else if (furryAmount >= 15) {
    furryEmoji = "🐈🐕";
    furryText = "you be thinking about the wrong things";
  } else if (furryAmount >= 7) {
    furryEmoji = "👍⁉";
    furryText = "you're normal. i hope.";
  } else {
    furryEmoji = "👍";
    furryText = "you're normal, thank you. have 1 xp";

    if (cache.has(member.user.id)) {
      cache.delete(member.user.id);
      await updateXp(member, (await getXp(member)) + 1);
    }
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${furryAmount}**% furry ${furryEmoji}\n${furryText}`
  ).setHeader("furry detector 5000", member.user.avatarURL());

  if (furryAmount < 7) {
    embed.setFooter({ text: "+1xp" });
  }

  await send({ embeds: [embed] });

  await addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
