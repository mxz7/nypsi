import { CommandInteraction, GuildMember, Message, MessageFlags } from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import {
  calcNetWorth,
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  hasPadlock,
  updateBalance,
} from "../utils/functions/economy/balance.js";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  calculateRawLevel,
  getLevel,
  getLevelRequirements,
  getPrestige,
} from "../utils/functions/economy/levelling.js";
import { createUser, deleteUser, getItems, userExists } from "../utils/functions/economy/utils.js";
import { getMember, getUserId } from "../utils/functions/member.js";
import { getNypsiBankBalance, getTax, getTaxRefreshTime } from "../utils/functions/tax.js";
import { addView } from "../utils/functions/users/views";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("balance", "check your balance", "money").setAliases([
  "bal",
  "money",
  "wallet",
  "bank",
]);

cmd.slashEnabled = true;

cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("view balance of this user").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (message.author.id == Constants.OWNER_ID && args.length == 2) {
    let target: GuildMember | string = message.mentions.members.first();

    if (!target) {
      target = args[0];
      if (!(await userExists(target))) await createUser(target);
    }

    if (args[1] == "reset") {
      await deleteUser(target);
      if (!(message instanceof Message)) return;
      return message.react("✅");
    } else if (args[1] == "clearinv") {
      await prisma.inventory.deleteMany({
        where: {
          userId: getUserId(target),
        },
      });

      if (!(message instanceof Message)) return;
      return message.react("✅");
    }

    const amount = parseInt(args[1]);

    await updateBalance(target, amount);

    if (!(message instanceof Message)) return;
    return message.react("✅");
  }

  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 2);

  if (!(await userExists(target))) await createUser(target);

  if (target.user.id == Constants.BOT_USER_ID) {
    const embed = new CustomEmbed(message.member).setHeader("nypsi bank", target.user.avatarURL());

    embed.setDescription(
      `**current balance** $${(
        await getNypsiBankBalance()
      ).toLocaleString()}\n**current tax rate** ${((await getTax()) * 100).toFixed(
        1,
      )}%\n\ntax updates <t:${await getTaxRefreshTime()}:R>`,
    );

    return send({ embeds: [embed] });
  }

  const [balance, prestige, inventory, net, bankBalance, bankMaxBalance, padlock, level] =
    await Promise.all([
      getBalance(target),
      getPrestige(target),
      getInventory(target),
      calcNetWorth("balance", target, target.client as NypsiClient),
      getBankBalance(target),
      getMaxBankBalance(target),
      hasPadlock(target),
      getLevel(target),
    ]);

  const rawLevel = calculateRawLevel(level, prestige);

  let footer = `level ${level}`;

  if (prestige > 0) {
    footer = `prestige ${prestige} | level ${level}`;
  }

  let padlockStatus = false;

  if (target.user.id == message.author.id && padlock) {
    padlockStatus = true;
  }

  let gemLine = "";

  if ((await inventory.hasGem("crystal_heart")).any)
    gemLine += `${getItems()["crystal_heart"].emoji}`;
  if ((await inventory.hasGem("white_gem")).any) gemLine += `${getItems()["white_gem"].emoji}`;
  if ((await inventory.hasGem("pink_gem")).any) gemLine += `${getItems()["pink_gem"].emoji}`;
  if ((await inventory.hasGem("purple_gem")).any) gemLine += `${getItems()["purple_gem"].emoji}`;
  if ((await inventory.hasGem("blue_gem")).any) gemLine += `${getItems()["blue_gem"].emoji}`;
  if ((await inventory.hasGem("green_gem")).any) gemLine += `${getItems()["green_gem"].emoji}`;

  let levelNotice = "";

  if (
    target.user.id === message.author.id &&
    getLevelRequirements(rawLevel).money > bankMaxBalance &&
    rawLevel < 700
  ) {
    levelNotice =
      "\n\nyour bank is too small for the next level up, you can use [stolen credit cards](https://nypsi.xyz/items/stolen_credit_card?ref=bot-level) to increase your bank size";
  }

  const embed = new CustomEmbed(target)
    .setDescription(
      `${padlockStatus ? "🔒" : "💰"} $**${balance.toLocaleString()}**\n` +
        `💳 $**${bankBalance.toLocaleString()}** / $**${bankMaxBalance.toLocaleString()}**${
          net.amount > 15_000_000 ? `\n${gemLine}\n🌍 $**${net.amount.toLocaleString()}**` : ""
        }${levelNotice}`,
    )
    .setFooter({ text: footer });

  embed.setHeader(
    `${target.user.username} | season ${Constants.SEASON_NUMBER}`,
    target.user.avatarURL(),
    `https://nypsi.xyz/users/${target.id}?ref=bot-bal`,
  );

  send({ embeds: [embed] });

  addView(target, message.member, `balance in ${message.guild.id}`);
}

cmd.setRun(run);

module.exports = cmd;
