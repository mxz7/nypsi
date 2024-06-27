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
import { getBoosters } from "../utils/functions/economy/boosters";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getItems } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
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
    `${member.user.toString()}\n${sizeMsg}\n📏 ${size} ${size == 1 ? "inch" : "inches"}`,
  ).setHeader("pp predictor 1337", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.author.id, "unsure", 1);

  if (size < 5 && member.user.id === message.author.id)
    addTaskProgress(message.author.id, "pp_small");
  else if (size > 6 && member.user.id === message.author.id)
    addTaskProgress(message.author.id, "pp_big");
  else if (member.user.id === message.author.id) addTaskProgress(message.author.id, "pp");
}

cmd.setRun(run);

module.exports = cmd;
