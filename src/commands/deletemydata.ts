import { exec } from "child_process";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../init/database.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getGuildByUser } from "../utils/functions/economy/guilds.js";
import { hasProfile } from "../utils/functions/users/utils.js";
import { addCooldown, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { logger } from "../utils/logger";
import ms = require("ms");

const cmd = new Command("deletemydata", "delete your data from nypsi's database", Categories.INFO);

const cooldown = new Set<string>();

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (cooldown.has(message.author.id)) {
    return message.channel.send({ embeds: [new ErrorEmbed("please wait before doing that again")] });
  }
  if (await onCooldown(cmd.name, message.member)) {
    const embed = new ErrorEmbed("you have already deleted your data recently.");

    return message.channel.send({ embeds: [embed] });
  }

  if (!(await hasProfile(message.author.id))) {
    return message.channel.send({ embeds: [new ErrorEmbed("we have no data on you to delete")] });
  }

  const embed = new CustomEmbed(message.member).setHeader("data deletion request", message.author.avatarURL());

  embed.setDescription("by doing this, you will lose **all** of your data. this includes a full wipe on economy.");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("y").setLabel("delete").setStyle(ButtonStyle.Danger)
  );

  cooldown.add(message.author.id);

  setTimeout(() => {
    cooldown.delete(message.author.id);
  }, 60000);

  const m = await message.channel.send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await m
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      embed.setDescription("request expired");
      await m.edit({ embeds: [embed] });
      fail = true;
    });

  if (fail) return;

  if (typeof response != "string") return;

  if (response == "y") {
    await addCooldown(cmd.name, message.member, Math.floor(ms("1 week") / 1000));
    embed.setDescription("deleting all of your data...");

    await m.edit({ embeds: [embed], components: [] });

    logger.info(`deleting data for ${message.author.tag}...`);

    await prisma.booster.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.economyStats.deleteMany({
      where: {
        economyUserId: message.author.id,
      },
    });

    const guild = await getGuildByUser(message.member);

    if (guild) {
      await prisma.economyGuildMember.deleteMany({
        where: {
          guildName: guild.guildName,
        },
      });

      await prisma.economyGuild.delete({
        where: {
          guildName: guild.guildName,
        },
      });
    } else {
      await prisma.economyGuildMember.deleteMany({
        where: {
          userId: message.author.id,
        },
      });
    }

    await prisma.wordleStats.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.username.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.mention.deleteMany({
      where: {
        targetId: message.author.id,
      },
    });

    await prisma.lotteryTicket.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.premiumCommand.deleteMany({
      where: {
        owner: message.author.id,
      },
    });

    await prisma.wholesomeImage.updateMany({
      where: {
        submitterId: message.author.id,
      },
      data: {
        submitterId: "[redacted]",
        submitter: "[redacted]",
      },
    });

    await prisma.chatReactionStats.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.economy.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.premium.deleteMany({
      where: {
        userId: message.author.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: message.author.id,
      },
    });

    exec(`redis-cli KEYS "*:${message.author.id}:*" | xargs redis-cli DEL`);

    logger.info(`data deleted for ${message.author.id}`);

    embed.setDescription("your data has been deleted");

    await m.edit({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
