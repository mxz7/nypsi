import { MessageFlags } from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBankBalance, getMaxBankBalance } from "../utils/functions/economy/balance";
import {
  calculateRawLevel,
  getLevel,
  getLevelRequirements,
  getNextPrestigeRequirements,
  getPrestige,
} from "../utils/functions/economy/levelling";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getXp } from "../utils/functions/economy/xp";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("level", "view your progress to the next level", "money").setAliases([
  "le",
  "lu",
  "levelup",
]);

cmd.setRun(async (message, send) => {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const [level, xp, bank, prestige, maxBank] = await Promise.all([
    getLevel(message.member),
    getXp(message.member),
    getBankBalance(message.member),
    getPrestige(message.member),
    getMaxBankBalance(message.member),
  ]);

  const nextLevelRequirements = getLevelRequirements(prestige, level);
  const nextPrestigeRequirements = getNextPrestigeRequirements(prestige, level);

  const rawLevel = calculateRawLevel(level, prestige);

  const showSccNotice = nextLevelRequirements.money > maxBank && rawLevel < 700;

  const embed = new CustomEmbed(message.member)
    .setHeader("level requirements", message.author.avatarURL())
    .addFields(
      {
        name: `level ${level + 1}`,
        value:
          `**xp** ${xp.toLocaleString()}/${nextLevelRequirements.xp.toLocaleString()}\n` +
          `**bank** $${bank.toLocaleString()}/$${nextLevelRequirements.money.toLocaleString()}`,
        inline: true,
      },
      {
        name: `next prestige (level ${Math.ceil((level + 1) / 100) * 100})`,
        value:
          `**xp** ${xp.toLocaleString()}/${nextPrestigeRequirements.xp.toLocaleString()}\n` +
          `**bank** $${bank.toLocaleString()}/$${nextPrestigeRequirements.money.toLocaleString()}`,
        inline: true,
      },
    )
    .setFooter({ text: `currently prestige ${prestige} level ${level}` });

  if (showSccNotice) {
    embed.setDescription(
      "your bank is too small for the next level up, you can use [stolen credit cards](https://nypsi.xyz/items/stolen_credit_card?ref=bot-level) to increase your bank size",
    );
  }

  return send({
    embeds: [embed],
  });
});

module.exports = cmd;
