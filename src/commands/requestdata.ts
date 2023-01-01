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
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addCooldown, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { logger } from "../utils/logger";

const cmd = new Command("requestdata", "view your raw data stored in nypsi's database", Categories.INFO).setAliases([
  "data",
  "viewdata",
  "showmemydatazuckerberg",
]);

cmd.slashEnabled = true;

const cooldown = new Set<string>();

// @ts-expect-error ts doesnt like that
BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
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

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (cooldown.has(message.author.id)) {
    return send({ embeds: [new ErrorEmbed("please wait before doing that again")], ephemeral: true });
  }
  if (await onCooldown(cmd.name, message.member)) {
    const embed = new ErrorEmbed("you have already received your data recently.");

    return send({ embeds: [embed], ephemeral: true });
  }

  const embed = new CustomEmbed(message.member).setHeader("data request", message.author.avatarURL());

  embed.setDescription("you can request and view all of your data stored by nypsi");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("y").setLabel("request data").setStyle(ButtonStyle.Success)
  );

  cooldown.add(message.author.id);

  setTimeout(() => {
    cooldown.delete(message.author.id);
  }, 60000);

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

    const file = `temp/${message.author.id}.txt`;

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
      await addCooldown(cmd.name, message.member, 604800);
      embed.setDescription("check your direct messages");
    }
    await edit({ embeds: [embed] }, m);
    await fs.unlink(file);
  }
}

cmd.setRun(run);

module.exports = cmd;
