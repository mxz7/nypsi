import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBalance, hasPadlock, setPadlock, updateBalance } from "../utils/functions/economy/balance";
import { addToGuildXP, getGuildByUser } from "../utils/functions/economy/guilds";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse, addRob } from "../utils/functions/economy/stats";
import { createUser, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { calcEarnedXp, getXp, updateXp } from "../utils/functions/economy/xp";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const playerCooldown = new Set<string>();

const cmd = new Command("rob", "rob other server members", Categories.MONEY).setAliases(["steal"]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("who do u wanna rob").setRequired(true));

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

  if ((await redis.exists(`${Constants.redis.cooldown.ROB_RADIO}:${message.author.id}`)) == 1) {
    const init = parseInt(await redis.get(`${Constants.redis.cooldown.ROB_RADIO}:${message.author.id}`));
    const curr = new Date();
    const diff = Math.round((curr.getTime() - init) / 1000);
    const time = 900 - diff;

    const minutes = Math.floor(time / 60);
    const seconds = time - minutes * 60;

    let remaining: string;

    if (minutes != 0) {
      remaining = `${minutes}m${seconds}s`;
    } else {
      remaining = `${seconds}s`;
    }
    return send({
      embeds: [
        new ErrorEmbed(`you have been reported to the police, they will continue looking for you for **${remaining}**`),
      ],
    });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("rob help")
      .addField("usage", `${prefix}rob <@user>`)
      .addField(
        "help",
        "robbing a user is a useful way for you to make money\nyou can steal a maximum of **40**% of their balance\n" +
          "but there is also a chance that you get caught by the police or just flat out failing the robbery\n" +
          "you can lose up to **25**% of your balance by failing a robbery"
      );

    return send({ embeds: [embed] });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  if (message.guild.id == "747056029795221513") {
    return send({ embeds: [new ErrorEmbed("this has been disabled in the support server")] });
  }

  let target = message.mentions.members.first();

  if (!target) {
    target = await getMember(message.guild, args[0]);
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.bot) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (await isEcoBanned(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (message.member == target) {
    return send({ embeds: [new ErrorEmbed("you cant rob yourself")] });
  }

  if (!(await userExists(target)) || (await getBalance(target)) <= 500) {
    return send({ embeds: [new ErrorEmbed("this user doesnt have sufficient funds")] });
  }

  const targetGuild = await getGuildByUser(target);

  if (targetGuild) {
    if (targetGuild.guildName == (await getGuildByUser(message.member))?.guildName) {
      return send({ embeds: [new ErrorEmbed("you cannot rob someone in your own guild")] });
    }
  }

  if ((await getBalance(message.member)) < 750) {
    return send({ embeds: [new ErrorEmbed("you need $750 in your wallet to rob someone")] });
  }

  await addCooldown(cmd.name, message.member, 700);

  const embed = new CustomEmbed(message.member, "robbing " + target.user.toString() + "..").setHeader(
    "robbery",
    message.author.avatarURL()
  );

  const embed2 = new CustomEmbed(message.member, "robbing " + target.user.toString() + "..").setHeader(
    "robbery",
    message.author.avatarURL()
  );

  const embed3 = new CustomEmbed();

  let robberySuccess = false;

  if (playerCooldown.has(target.user.id)) {
    const amount = Math.floor(Math.random() * 9) + 1;
    const amountMoney = Math.round((await getBalance(message.member)) * (amount / 100));

    await updateBalance(target, (await getBalance(target)) + amountMoney);
    await updateBalance(message.member, (await getBalance(message.member)) - amountMoney);

    embed2.setColor(Constants.EMBED_FAIL_COLOR);
    embed2.addField(
      "**fail!!**",
      "**" +
        target.user.tag +
        "** has been robbed recently and is protected by a private security team\n" +
        "you were caught and paid $" +
        amountMoney.toLocaleString()
    );

    embed3.setTitle("you were nearly robbed");
    embed3.setColor(Constants.EMBED_SUCCESS_COLOR);
    embed3.setDescription(
      "**" +
        message.member.user.tag +
        "** tried to rob you in **" +
        message.guild.name +
        "**\n" +
        "since you have been robbed recently, you are protected by a private security team.\nyou have been given $**" +
        amountMoney.toLocaleString() +
        "**"
    );
  } else if (await hasPadlock(target)) {
    await setPadlock(target, false);

    const amount = Math.floor(Math.random() * 35) + 5;
    const amountMoney = Math.round((await getBalance(target)) * (amount / 100));

    embed2.setColor(Constants.EMBED_FAIL_COLOR);
    embed2.addField("fail!!", "**" + target.user.tag + "** had a padlock, which has now been broken");

    embed3.setTitle("you were nearly robbed");
    embed3.setColor(Constants.EMBED_SUCCESS_COLOR);
    embed3.setDescription(
      "**" +
        message.member.user.tag +
        "** tried to rob you in **" +
        message.guild.name +
        "**\n" +
        "your padlock has saved you from a robbery, but it has been broken\nthey would have stolen $**" +
        amountMoney.toLocaleString() +
        "**"
    );
  } else {
    const chance = Math.floor(Math.random() * 22);

    if (chance > 6) {
      robberySuccess = true;

      const amount = Math.floor(Math.random() * 35) + 5;
      const amountMoney = Math.round((await getBalance(target)) * (amount / 100));

      await updateBalance(target, (await getBalance(target)) - amountMoney);
      await updateBalance(message.member, (await getBalance(message.member)) + amountMoney);

      embed2.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed2.addField("success!!", "you stole $**" + amountMoney.toLocaleString() + "**");

      const earnedXp = await calcEarnedXp(message.member, 6942069);
      await addProgress(message.author.id, "robber", 1);

      if (earnedXp > 0) {
        await updateXp(message.member, (await getXp(message.member)) + earnedXp);
        embed2.setFooter({ text: `+${earnedXp}xp` });

        const guild = await getGuildByUser(message.member);

        if (guild) {
          await addToGuildXP(guild.guildName, earnedXp, message.member, message.client as NypsiClient);
        }
      }

      embed3.setTitle("you have been robbed");
      embed3.setColor(Constants.EMBED_FAIL_COLOR);
      embed3.setDescription(
        "**" +
          message.member.user.tag +
          "** has robbed you in **" +
          message.guild.name +
          "**\n" +
          "they stole a total of $**" +
          amountMoney.toLocaleString() +
          "**"
      );

      playerCooldown.add(target.user.id);

      const length = Math.floor(Math.random() * 30) + 30;

      setTimeout(() => {
        playerCooldown.delete(target.user.id);
      }, length * 1000);
    } else {
      const amount = Math.floor(Math.random() * 20) + 5;
      const amountMoney = Math.round((await getBalance(message.member)) * (amount / 100));

      const inventory = await getInventory(message.member);

      if (inventory.find((i) => i.item == "lawyer") && inventory.find((i) => i.item == "lawyer").amount > 0) {
        await Promise.all([
          setInventoryItem(message.member, "lawyer", inventory.find((i) => i.item == "lawyer").amount - 1, false),
          addItemUse(message.member, "lawyer"),
        ]);

        embed2.addField(
          "fail!!",
          `you were caught by the police, but your lawyer stopped you from losing any money\nyou would have lost $${amountMoney.toLocaleString()}`
        );
        embed3.setDescription(
          "**" +
            message.member.user.tag +
            "** tried to rob you in **" +
            message.guild.name +
            "**\n" +
            "they were caught by the police, but a lawyer protected their money"
        );
      } else {
        await updateBalance(target, (await getBalance(target)) + amountMoney);
        await updateBalance(message.member, (await getBalance(message.member)) - amountMoney);
        embed2.addField("fail!!", "you lost $**" + amountMoney.toLocaleString() + "**");
        embed3.setDescription(
          "**" +
            message.member.user.tag +
            "** tried to rob you in **" +
            message.guild.name +
            "**\n" +
            "they were caught by the police and you received $**" +
            amountMoney.toLocaleString() +
            "**"
        );
      }

      embed2.setColor(Constants.EMBED_FAIL_COLOR);

      embed3.setTitle("you were nearly robbed");
      embed3.setColor(Constants.EMBED_SUCCESS_COLOR);
    }
  }

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  send({ embeds: [embed] }).then(async (m) => {
    setTimeout(async () => {
      await edit({ embeds: [embed2] }, m);

      if ((await getDmSettings(target)).rob) {
        if (robberySuccess) {
          await addRob(message.member, true);
          await target.send({ content: "you have been robbed!!", embeds: [embed3] }).catch(() => {});
        } else {
          await addRob(message.member, false);
          await target.send({ content: "you were nearly robbed!!", embeds: [embed3] }).catch(() => {});
        }
      }
    }, 1500);
  });
}

cmd.setRun(run);

module.exports = cmd;
