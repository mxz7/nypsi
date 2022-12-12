import { BaseMessageOptions, CommandInteraction, GuildMember, InteractionReplyOptions, Message } from "discord.js";
import prisma from "../init/database";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
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

const cmd = new Command("balance", "check your balance", Categories.MONEY).setAliases(["bal", "money", "wallet"]);

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

  await addCooldown(cmd.name, message.member, 5);

  if (!(await userExists(target))) await createUser(target);

  if (target.user.id == "678711738845102087") {
    const embed = new CustomEmbed(message.member).setHeader("nypsi bank", target.user.avatarURL());

    embed.setDescription(
      `**current balance** $${(await getNypsiBankBalance()).toLocaleString()}\n**current tax rate** ${(
        (await getTax()) * 100
      ).toFixed(1)}%\n\ntax updates <t:${await getTaxRefreshTime()}:R>`
    );

    return send({ embeds: [embed] });
  }

  let footer = `xp: ${(await getXp(target)).toLocaleString()}`;

  if ((await getPrestige(target)) > 0) {
    footer += ` | prestige: ${await getPrestige(target)}`;
  }

  let padlockStatus = false;

  if (target.user.id == message.author.id && (await hasPadlock(message.member))) {
    padlockStatus = true;
  }

  const inventory = await getInventory(target);
  const net = await calcNetWorth(target);
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
      `${padlockStatus ? "🔒" : "💰"} $**${(await getBalance(target)).toLocaleString()}**\n` +
        `💳 $**${(await getBankBalance(target)).toLocaleString()}** / $**${(
          await getMaxBankBalance(target)
        ).toLocaleString()}**${net > 1_000_000 ? `\n${gemLine}\n🌍 $**${net.toLocaleString()}**` : ""}`
    )
    .setFooter({ text: footer });

  if (target.user.id == message.author.id) {
    embed.setHeader("your balance | season 4", message.author.avatarURL());
  } else {
    embed.setHeader(`${target.user.username}'s balance | season 4`, target.user.avatarURL());
  }

  if (message.member == target) {
    if (
      (await getXp(target)) >= (await getPrestigeRequirement(target)) &&
      (await getBankBalance(target)) >= getPrestigeRequirementBal(await getXp(target)) &&
      (await getPrestige(target)) < 20
    ) {
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
