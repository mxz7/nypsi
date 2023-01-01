import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("pp", "accurate prediction of your pp size", Categories.FUN).setAliases([
  "penis",
  "12inchmonster",
  "1inchwarrior",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how big is your willy"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
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

  let size;
  let sizeMsg = "8";

  if (cache.has(member.user.id)) {
    size = cache.get(member.user.id);
  } else {
    size = Math.floor(Math.random() * 15);

    let chance = 45;

    if (await isPremium(member.user.id)) {
      if ((await getTier(member.user.id)) >= 3) {
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

  for (let i = 0; i < size; i++) {
    sizeMsg = sizeMsg + "=";
  }

  sizeMsg = sizeMsg + "D";

  const embed = new CustomEmbed(message.member, `${member.user.toString()}\n${sizeMsg}\n📏 ${size} inches`).setHeader(
    "pp predictor 1337",
    member.user.avatarURL()
  );

  send({ embeds: [embed] });

  addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
