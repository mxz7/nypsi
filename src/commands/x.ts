import { CommandInteraction, Message, User } from "discord.js";
import * as fs from "fs/promises";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import { logger } from "../utils/logger";

const cmd = new Command("x", "admincmd", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(message instanceof Message)) return;
  if (!Constants.ADMIN_IDS.includes(message.author.id)) return message.react("🫦");

  const showUser = async (id: string) => {
    const res = await (message.client as NypsiClient).cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.fetch(userId);

        return g;
      },
      { context: { userId: id } }
    );

    let user: User;

    for (const i of res) {
      if ((i as any).username) {
        user = i as User;
        break;
      }
    }

    if (!user) {
      message.react("❌");
      user = {} as User;
    }

    const embed = new CustomEmbed(
      message.member,
      `tag: ${user?.username}#${user?.discriminator}\nid: ${user?.id}\ncreated: <t:${Math.floor(
        user.createdTimestamp / 1000
      )}:R>`
    ).setHeader("discord");

    const usernameHistory = await fetchUsernameHistory(user.id);

    if (usernameHistory.length > 0) {
      let msg = "";

      let count = 0;
      for (const un of usernameHistory) {
        if (count >= 10) break;
        msg += `\`${un.value}\` | \`${formatDate(un.date)}\`\n`;
        count++;
      }

      embed.addField("username history", msg, true);
    }

    logger.info(`fetching data for ${id}...`);
    const userData = await prisma.user.findUnique({
      where: {
        id: id,
      },
      include: {
        Economy: {
          include: {
            EconomyGuild: true,
            EconomyGuildMember: true,
            Auction: true,
            BakeryUpgrade: true,
            Inventory: true,
            Boosters: true,
            Game: true,
            ItemUse: true,
            Crafting: true,
            LotteryTicket: true,
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
        user: id,
      },
    });

    const moderationCasesModerator = await prisma.moderationCase
      .findMany({
        where: {
          moderator: user?.tag,
        },
      })
      .catch(() => {});

    const moderationMutes = await prisma.moderationMute.findMany({
      where: {
        userId: id,
      },
    });

    const moderationBans = await prisma.moderationBan.findMany({
      where: {
        userId: id,
      },
    });

    const chatReactionStats = await prisma.chatReactionStats.findMany({
      where: {
        userId: id,
      },
    });

    const file = `/tmp/nypsi_data_${id}.txt`;

    logger.info(`packing into text file for ${id}...`);

    await fs.writeFile(
      file,
      `nypsi data for ${user?.username}#${user?.discriminator} (${user?.id}) requested by ${message.author.tag} ${
        message.author.id
      } - ${new Date().toUTCString()}\n\n----------\nYOUR USER DATA\n----------\n\n`
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

    const buffer = await fs.readFile(file);

    return message.channel.send({ embeds: [embed], files: [{ attachment: buffer, name: `data_for_${user.id}.txt` }] });
  };

  const findId = async (tag: string) => {
    const findFromCache = async () => {
      let user: any = await (message.client as NypsiClient).cluster.broadcastEval(
        async (c, { userId }) => {
          const g = await c.users.cache.find((u) => {
            return `${u.username}#${u.discriminator}`.includes(userId);
          });

          return g;
        },
        { context: { userId: tag } }
      );

      for (const res of user) {
        if (!res) continue;
        if (res.username) {
          user = res;
          break;
        }
      }

      if (!user || user instanceof Array) return null;

      return user.id as string;
    };

    const current = await findFromCache();

    let desc = `current: ${current || "not found"}`;

    const knownTag = await prisma.user.findFirst({
      where: {
        lastKnownTag: { contains: tag },
      },
      select: {
        id: true,
      },
    });

    desc += `\nlkt: ${knownTag?.id || "not found"}`;

    const usernameHistories = await prisma.username.findMany({
      where: {
        AND: [{ type: "username" }, { value: { contains: tag } }],
      },
      select: {
        value: true,
        userId: true,
      },
    });

    if (usernameHistories.length > 0) {
      desc += `\nhistories: \n${usernameHistories
        .map((i) => `\`${i.userId}\` - \`${i.value}\``)
        .join("\n")
        .substring(0, 1000)}`;
    }

    return message.channel.send({ embeds: [new CustomEmbed(message.member, desc)] });
  };

  const removeItem = async (userId: string, itemId: string, amount = 1) => {
    const inventory = await getInventory(userId, false);

    if (inventory.length == 0) {
      return message.channel.send({ embeds: [new ErrorEmbed("user's inventory is empty")] });
    }

    if (!getItems()[itemId]) return message.channel.send({ embeds: [new ErrorEmbed("invalid item")] });

    await setInventoryItem(userId, itemId, inventory.find((i) => i.item == itemId).amount - amount, false);

    return message.react("💦");
  };

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      "$x userid (id) - view disc info and db info" +
        "\n$x removeitem (id) (item_id) (amount) - remove item from user inventory" +
        "\n$x findid (tag/username) - will attempt to find user id from cached users and database"
    );

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "userid") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("$x userid (id)")] });
    }

    return showUser(args[1]);
  } else if (args[0].toLowerCase() == "findid") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("$x findid (tag)")] });
    }

    return findId(args[1]);
  } else if (args[0].toLowerCase() == "removeitem") {
    if (args.length < 3) {
      return message.channel.send({ embeds: [new ErrorEmbed("$x removeitem <userid> <item> <amount>")] });
    }

    return removeItem(args[1], args[2], args[3] ? parseInt(args[3]) : undefined);
  }
}

cmd.setRun(run);

module.exports = cmd;
