import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
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
import { getPrestige, getPrestigeRequirement, getPrestigeRequirementBal } from "../utils/functions/economy/prestige.js";
import { createUser, deleteUser, getItems, userExists } from "../utils/functions/economy/utils.js";
import { getXp } from "../utils/functions/economy/xp.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member.js";
import { getNypsiBankBalance, getTax, getTaxRefreshTime } from "../utils/functions/tax.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("balance", "check your balance", "money").setAliases(["bal", "money", "wallet", "bank"]);

cmd.slashEnabled = true;

cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("view balance of this user").setRequired(false)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id == Constants.TEKOH_ID && args.length == 2) {
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
          userId: typeof target == "string" ? target : target.user.id,
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
    target = message.mentions.members.first();

    if (!target) {
      target = await getMember(message.guild, args.join(" "));
    }

    if (!target) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

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

  await addCooldown(cmd.name, message.member, 5);

  if (!(await userExists(target))) await createUser(target);

  if (target.user.id == Constants.BOT_USER_ID) {
    const embed = new CustomEmbed(message.member).setHeader("nypsi bank", target.user.avatarURL());

    embed.setDescription(
      `**current balance** $${(await getNypsiBankBalance()).toLocaleString()}\n**current tax rate** ${(
        (await getTax()) * 100
      ).toFixed(1)}%\n\ntax updates <t:${await getTaxRefreshTime()}:R>`
    );

    return send({ embeds: [embed] });
  }

  const [balance, xp, prestige, inventory, net, bankBalance, bankMaxBalance, padlock] = await Promise.all([
    getBalance(target),
    getXp(target),
    getPrestige(target),
    getInventory(target),
    calcNetWorth(target),
    getBankBalance(target),
    getMaxBankBalance(target),
    hasPadlock(target),
  ]);

  let footer = `xp: ${xp.toLocaleString()}`;

  if (prestige > 0) {
    footer += ` | prestige: ${prestige}`;
  }

  let padlockStatus = false;

  if (target.user.id == message.author.id && padlock) {
    padlockStatus = true;
  }

  let gemLine = "";

  const gems: string[] = [];
  inventory.forEach((i) => {
    switch (i.item) {
      case "crystal_heart":
      case "white_gem":
      case "pink_gem":
      case "purple_gem":
      case "blue_gem":
      case "green_gem":
        gems.push(i.item);
        break;
    }
  });
  if (gems.includes("crystal_heart")) gemLine += `${getItems()["crystal_heart"].emoji}`;
  if (gems.includes("white_gem")) gemLine += `${getItems()["white_gem"].emoji}`;
  if (gems.includes("pink_gem")) gemLine += `${getItems()["pink_gem"].emoji}`;
  if (gems.includes("purple_gem")) gemLine += `${getItems()["purple_gem"].emoji}`;
  if (gems.includes("blue_gem")) gemLine += `${getItems()["blue_gem"].emoji}`;
  if (gems.includes("green_gem")) gemLine += `${getItems()["green_gem"].emoji}`;

  const embed = new CustomEmbed(message.member)
    .setDescription(
      `${padlockStatus ? "🔒" : "💰"} $**${balance.toLocaleString()}**\n` +
        `💳 $**${bankBalance.toLocaleString()}** / $**${bankMaxBalance.toLocaleString()}**${
          net.amount > 15_000_000 ? `\n${gemLine}\n🌍 $**${net.amount.toLocaleString()}**` : ""
        }`
    )
    .setFooter({ text: footer });

  embed.setHeader(`${target.user.username} | season 5`, target.user.avatarURL());

  if (message.member == target) {
    if (xp >= (await getPrestigeRequirement(target)) && bankBalance >= getPrestigeRequirementBal(xp)) {
      return send({
        content: `you are eligible to prestige, use ${await getPrefix(message.guild)}prestige for more info`,
        embeds: [embed],
      });
    }
  }

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
