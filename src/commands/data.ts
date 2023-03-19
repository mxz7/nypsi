import { exec } from "child_process";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import * as fs from "fs/promises";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addCooldown, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { logger } from "../utils/logger";
import ms = require("ms");

const cmd = new Command("data", "view your raw data stored in nypsi's database", "info").setAliases([
  "requestdata",
  "viewdata",
  "showmemydatazuckerberg",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((del) =>
    del.setName("delete").setDescription("request deletion of all data held on you by nypsi's database")
  )
  .addSubcommand((view) => view.setName("request").setDescription("view all of the data held on you by nypsi's database"));

// @ts-expect-error ts doesnt like that
BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/data request** *receive a downloadable txt file including all of the data currently held about you in the database*\n" +
            "**/data delete** *request deletion of all of your data. where this is not possible, your data will be anonymized. the exception for this is moderation data."
        ),
      ],
    });
  } else if (["request", "view"].includes(args[0].toLowerCase())) {
    if (await onCooldown(cmd.name + "_view", message.member)) {
      const embed = new ErrorEmbed("you have already received your data recently.");

      return send({ embeds: [embed], ephemeral: true });
    }

    const embed = new CustomEmbed(message.member).setHeader("data request", message.author.avatarURL());

    embed.setDescription("you can request and view all of your data stored by nypsi");

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("request data").setStyle(ButtonStyle.Success)
    );

    const m = await send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;
    let fail = false;

    const response = await m
      .awaitMessageComponent({ filter, time: 15000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        embed.setDescription("❌ expired");
        await m.edit({ embeds: [embed], components: [] });
        fail = true;
      });

    if (fail) return;

    if (typeof response != "string") return;

    if (response == "y") {
      embed.setDescription("fetching your data...");

      await m.edit({ embeds: [embed], components: [] });

      logger.info(`fetching data for ${message.author.tag}...`);
      const userData = await prisma.user.findUnique({
        where: {
          id: message.author.id,
        },
        include: {
          Economy: {
            include: {
              Inventory: true,
              Boosters: true,
              Game: true,
              ItemUse: true,
              Crafting: true,
              LotteryTicket: true,
              EconomyGuild: true,
              Auction: true,
              BakeryUpgrade: true,
              EconomyGuildMember: true,
              EconomyWorker: {
                include: {
                  upgrades: true,
                },
              },
            },
          },
          Premium: {
            include: {
              PremiumCommand: true,
            },
          },
          Username: true,
          WordleStats: true,
          Preferences: true,
          CommandUse: true,
          Achievements: true,
          DMSettings: true,
        },
      });

      const moderationCases = await prisma.moderationCase.findMany({
        where: {
          user: message.author.id,
        },
        select: {
          caseId: true,
          command: true,
          deleted: true,
          guildId: true,
          moderation: false,
          time: true,
          type: true,
          user: true,
          moderator: false,
        },
      });

      const moderationCasesModerator = await prisma.moderationCase.findMany({
        where: {
          moderator: message.author.tag,
        },
      });

      const moderationMutes = await prisma.moderationMute.findMany({
        where: {
          userId: message.author.id,
        },
      });

      const moderationBans = await prisma.moderationBan.findMany({
        where: {
          userId: message.author.id,
        },
      });

      const chatReactionStats = await prisma.chatReactionStats.findMany({
        where: {
          userId: message.author.id,
        },
      });

      const mentionsTargetedData = await prisma.mention.findMany({
        where: {
          targetId: message.author.id,
        },
      });
      const mentionsSenderData = await prisma.mention.findMany({
        where: {
          userTag: message.author.tag,
        },
      });

      const file = `/tmp/nypsi_data_${message.author.id}.txt`;

      logger.info(`packing into text file for ${message.author.tag}...`);

      await fs.writeFile(
        file,
        `nypsi data for ${message.author.id} (${
          message.author.tag
        } at time of request) - ${new Date().toUTCString()}\n\n----------\nYOUR USER DATA\n----------\n\n`
      );
      await fs.appendFile(file, JSON.stringify(userData, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MODERATION CASE DATA WHERE YOU GOT PUNISHED\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(moderationCases, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MODERATION CASE DATA WHERE YOU WERE THE MODERATOR\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(moderationCasesModerator, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MODERATION MUTE DATA\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(moderationMutes, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MODERATION BAN DATA\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(moderationBans, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR CHAT REACTION DATA\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(chatReactionStats, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MENTIONS DATA\n(mentions targetted at you)\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(mentionsTargetedData, null, 2));

      await fs.appendFile(
        file,
        "\n----------------------------------------------\n\n----------\nYOUR MENTIONS DATA\n(mentions from you - based on current tag)\n----------\n\n"
      );
      await fs.appendFile(file, JSON.stringify(mentionsSenderData, null, 2));

      const buffer = await fs.readFile(file);

      let fail = false;
      await message.member
        .send({
          files: [
            {
              attachment: buffer,
              name: "your data.txt",
            },
          ],
        })
        .catch((e) => {
          console.log(e);
          fail = true;
        });
      if (fail) {
        embed.setDescription("could not dm you, enable your direct messages");
      } else {
        await addCooldown(cmd.name + "_view", message.member, 604800);
        embed.setDescription("check your direct messages");
      }
      await edit({ embeds: [embed] }, m);
    }
  } else if (args[0].toLowerCase() === "delete") {
    if (await onCooldown(cmd.name + "_delete", message.member)) {
      const embed = new ErrorEmbed("you have already deleted your data recently.");

      return send({ embeds: [embed] });
    }

    const embed = new CustomEmbed(message.member).setHeader("data deletion request", message.author.avatarURL());

    embed.setDescription("by doing this, you will lose **all** of your data. this includes a full wipe on economy.");

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("delete").setStyle(ButtonStyle.Danger)
    );

    const m = await send({ embeds: [embed], components: [row] });

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
      await addCooldown(cmd.name + "_delete", message.member, Math.floor(ms("1 week") / 1000));
      embed.setDescription("deleting all of your data...");

      await m.edit({ embeds: [embed], components: [] });

      logger.info(`deleting data for ${message.author.tag}...`);

      await prisma.booster.deleteMany({
        where: {
          userId: message.author.id,
        },
      });

      await prisma.economyGuildMember.deleteMany({
        where: {
          userId: message.author.id,
        },
      });

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
}

cmd.setRun(run);

module.exports = cmd;
