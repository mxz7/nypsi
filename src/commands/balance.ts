import { CommandInteraction, GuildMember, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { getMember } from "../utils/functions/member.js";
import { getNypsiBankBalance, getTax, getTaxRefreshTime } from "../utils/functions/tax.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";
import { createUser, deleteUser, userExists } from "../utils/functions/economy/utils.js";
import {
  getBalance,
  getBankBalance,
  getMaxBankBalance,
  hasPadlock,
  updateBalance,
} from "../utils/functions/economy/balance.js";
import { getXp } from "../utils/functions/economy/xp.js";
import { getPrestige, getPrestigeRequirement, getPrestigeRequirementBal } from "../utils/functions/economy/prestige.js";

const cmd = new Command("balance", "check your balance", Categories.MONEY).setAliases(["bal", "money", "wallet"]);

cmd.slashEnabled = true;

cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("view balance of this user").setRequired(false)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id == "672793821850894347" && args.length == 2) {
    let target: GuildMember | string = message.mentions.members.first();

    if (!target) {
      target = args[0];
      if (!(await userExists(target))) await createUser(target);
    }

    if (args[1] == "reset") {
      await deleteUser(target);
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

  const send = async (data: MessageOptions | InteractionReplyOptions) => {
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
      return await message.channel.send(data as MessageOptions);
    }
  };

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

  const embed = new CustomEmbed(message.member)
    .setDescription(
      `${padlockStatus ? "🔒" : "💰"} $**` +
        (await getBalance(target)).toLocaleString() +
        "**\n" +
        "💳 $**" +
        (await getBankBalance(target)).toLocaleString() +
        "** / $**" +
        (await getMaxBankBalance(target)).toLocaleString() +
        "**"
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
