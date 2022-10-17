import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, string>();

const cmd = new Command("height", "accurate prediction of your height", Categories.FUN);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("i bet ur short"));

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

  let size;
  let feet;
  let inches;
  let sizeMsg;

  if (cache.has(member.user.id)) {
    size = cache.get(member.user.id);
    feet = size.split("'")[0];
    inches = size.split("'")[1];
  } else {
    feet = Math.floor(Math.random() * 6) + 4;
    inches = Math.floor(Math.random() * 12);

    if (feet > 6) feet = 5;

    size = `${feet}'${inches}`;

    cache.set(member.user.id, size);

    setTimeout(() => {
      cache.delete(member.user.id);
    }, 60 * 1000);
  }

  if (feet == 6) {
    sizeMsg = "yo ur tall 😳";
  } else if (feet == 5) {
    if (inches <= 6) {
      sizeMsg = "kinda short.. 🤨";
    } else {
      sizeMsg = "average 🙄";
    }
  } else {
    sizeMsg = "LOOOL UR TINY LMAO 😂🤣😆 IMAGINE";
  }

  const embed = new CustomEmbed(message.member, `${member.user.toString()}\n\n📏 ${size}\n${sizeMsg}`).setHeader(
    "short person calculator",
    member.user.avatarURL()
  );

  send({ embeds: [embed] });

  await addProgress(message.author.id, "unsure", 1);
}

cmd.setRun(run);

module.exports = cmd;
