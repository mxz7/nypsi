import {
  BaseMessageOptions,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBankBalance } from "../utils/functions/economy/balance";
import { getLevel, getLevelRequirements, getPrestige } from "../utils/functions/economy/levelling";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getXp } from "../utils/functions/economy/xp";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("level", "view your progress to the next level", "money").setAliases([
  "le",
  "lu",
  "levelup",
]);

cmd.setRun(async (message) => {
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

  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  const [level, xp, bank, prestige] = await Promise.all([
    getLevel(message.member),
    getXp(message.member),
    getBankBalance(message.member),
    getPrestige(message.member),
  ]);

  const required = getLevelRequirements(prestige, level);

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        `for level **${level + 1}**\n\n` +
          `**xp** ${xp.toLocaleString()}/${required.xp.toLocaleString()}\n` +
          `**bank** $${bank.toLocaleString()}/$${required.money.toLocaleString()}`,
      )
        .setHeader("level requirements", message.author.avatarURL())
        .setFooter({ text: `currently prestige ${prestige} level ${level}` }),
    ],
  });
});

module.exports = cmd;
