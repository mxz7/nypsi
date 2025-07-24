import dayjs = require("dayjs");
import { Prisma } from "@prisma/client";
import { exec } from "child_process";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  CommandInteraction,
  ComponentType,
  Guild,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  TextChannel,
  User,
} from "discord.js";
import { sort } from "fast-sort";
import * as fs from "fs/promises";
import { promisify } from "util";
import { gzip } from "zlib";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { startRandomDrop } from "../scheduled/clusterjobs/random-drops";
import Constants, { AdminPermission } from "../utils/Constants";
import { b, c } from "../utils/functions/anticheat";
import {
  getCaptchaHistory,
  giveCaptcha,
  isLockedOut,
  passedCaptcha,
} from "../utils/functions/captcha";
import { formatDate, MStoTime } from "../utils/functions/date";
import {
  calcNetWorth,
  getBalance,
  getBankBalance,
  getGambleMulti,
  getMaxBankBalance,
  updateBalance,
  updateBankBalance,
} from "../utils/functions/economy/balance";
import { initCrashGame } from "../utils/functions/economy/crash";
import { createEvent, getCurrentEvent } from "../utils/functions/economy/events";
import { getGuildByUser } from "../utils/functions/economy/guilds";
import {
  addInventoryItem,
  removeInventoryItem,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import { getPrestige, setLevel, setPrestige } from "../utils/functions/economy/levelling";
import { getTaskStreaks, setTaskStreak } from "../utils/functions/economy/tasks";
import { topBalanceGlobal } from "../utils/functions/economy/top";
import {
  doDaily,
  getDailyStreak,
  getEcoBanTime,
  getEventsData,
  getItems,
  getLastDaily,
  isEcoBanned,
  reset,
  setDaily,
  setEcoBan,
  userExists,
} from "../utils/functions/economy/utils";
import {
  getLastVote,
  getVoteStreak,
  giveVoteRewards,
  hasVoted,
  setVoteStreak,
} from "../utils/functions/economy/vote";
import { getXp, updateXp } from "../utils/functions/economy/xp";
import { getPeaks } from "../utils/functions/guilds/utils";
import { addKarma, getKarma, removeKarma } from "../utils/functions/karma/karma";
import { getMember, MemberResolvable } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { getUserAliases } from "../utils/functions/premium/aliases";
import {
  addMember,
  expireUser,
  getPremiumProfile,
  getTier,
  isPremium,
  levelString,
  setCredits,
  setExpireDate,
  setTier,
} from "../utils/functions/premium/premium";
import { getDuration } from "../utils/functions/string";
import { createSupportRequest } from "../utils/functions/supportrequest";
import { exportTransactions } from "../utils/functions/transactions";
import { getAdminLevel, hasAdminPermission, setAdminLevel } from "../utils/functions/users/admin";
import { setBirthday } from "../utils/functions/users/birthday";
import { isUserBlacklisted, setUserBlacklist } from "../utils/functions/users/blacklist";
import { getCommandUses, getLastCommand } from "../utils/functions/users/commands";
import { fetchUsernameHistory } from "../utils/functions/users/history";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addTag, getTags, removeTag } from "../utils/functions/users/tags";
import { hasProfile } from "../utils/functions/users/utils";
import {
  commandAliasExists,
  commandExists,
  getCommandFromAlias,
} from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import ms = require("ms");

const cmd = new Command("x", "admincmd", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(message instanceof Message)) return;
  if (!(await hasAdminPermission(message.member, "use-x"))) {
    if (await redis.exists("nypsi:xemoji:cooldown")) return;
    await redis.set("nypsi:xemoji:cooldown", "boobies", "EX", 5);
    return message.react(
      ["🫦", "💦", "🍑", "🍆", "😩"][
        Math.floor(Math.random() * ["🫦", "💦", "🍑", "🍆", "😩"].length)
      ],
    );
  }

  const requiredLevelEmbed = (permission: AdminPermission) => {
    return new ErrorEmbed(
      `you require admin level **${Constants.ADMIN_PERMISSIONS.get(permission)}** to do this`,
    );
  };

  const getUserFromId = async (id: string) => {
    const res = await (message.client as NypsiClient).cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.fetch(userId).catch(() => undefined as User);

        return g;
      },
      { context: { userId: id } },
    );

    let user: User;

    for (const i of res) {
      if ((i as any)?.username) {
        user = i as User;
        break;
      }
    }

    return user;
  };

  const getDbData = async (user: User) => {
    logger.info(`fetching data for ${user.id}...`);
    const data = {
      data: `nypsi data for ${user.id} (${user.username}) at ${dayjs().format(
        "YYYY-MM-DD HH:mm:ss",
      )}`,
      profile: await prisma.user.findUnique({
        where: {
          id: user.id,
        },
        include: {
          Economy: {
            include: {
              Farm: true,
              FarmUpgrades: true,
              Task: true,
              Inventory: true,
              Boosters: true,
              Stats: true,
              Crafting: true,
              EconomyGuild: {
                include: {
                  upgrades: true,
                  members: true,
                },
              },
              Market: true,
              BakeryUpgrade: true,
              EconomyGuildMember: true,
              OffersGiven: true,
              Upgrades: true,
              OffersReceived: true,
              MarketWatch: true,
              CustomCar: {
                include: {
                  upgrades: true,
                },
              },
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
          Preferences: true,
          CommandUse: true,
          Achievements: true,
          DMSettings: true,
          ActiveChannels: true,
          Leaderboards: true,
          Tags: true,
          Purchases: true,
          Captchas: true,
          ChatReactionLeaderboards: true,
          ModerationEvidence: true,
          Viewed: true,
          Views: true,
        },
      }),
      moderation: {
        punished: await prisma.moderationCase.findMany({
          where: {
            user: user.id,
          },
          select: {
            caseId: true,
            command: true,
            deleted: true,
            guildId: true,
            time: true,
            type: true,
            user: true,
            moderator: false,
          },
        }),
        punisher: await prisma.moderationCase.findMany({
          where: {
            OR: [{ moderator: user.username }, { moderator: user.id }],
          },
        }),
        bans: await prisma.moderationBan.findMany({ where: { userId: user.id } }),
        mutes: await prisma.moderationMute.findMany({ where: { userId: user.id } }),
      },
      chat_reaction: await prisma.chatReactionStats.findMany({
        where: { userId: user.id },
      }),
      mentions: {
        sender: await prisma.mention.findMany({ where: { userTag: user.username } }),
        receiver: await prisma.mention.findMany({ where: { targetId: user.id } }),
      },
    };

    const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf8");
    let gzipped: Buffer;

    if (buffer.byteLength > 7e6) gzipped = await promisify(gzip)(buffer);

    return { attachment: gzipped || buffer, name: `${user.id}.json${gzipped ? ".gz" : ""}` };
  };

  const showUser = async (id: string) => {
    const user = await getUserFromId(id);

    if (!user) {
      return send({ embeds: [new ErrorEmbed("invalid id")] });
    }

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("db-data")
          .setLabel("view all db data")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💻")
          .setDisabled(!(await hasAdminPermission(message.member, "user-db-data"))),
        new ButtonBuilder()
          .setCustomId("cmds")
          .setLabel("command count")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("⌨️")
          .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
        new ButtonBuilder()
          .setCustomId("view-premium")
          .setLabel("premium")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💎")
          .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
        new ButtonBuilder()
          .setCustomId("set-admin")
          .setLabel("set admin level")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👨🏻‍💼")
          .setDisabled(!(await hasAdminPermission(message.member, "set-admin-level"))),
        new ButtonBuilder()
          .setCustomId("create-chat")
          .setLabel("create chat")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💬")
          .setDisabled(!(await hasAdminPermission(message.member, "create-chat"))),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("ac")
          .setLabel("anticheat")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🤥")
          .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
        new ButtonBuilder()
          .setCustomId("tags")
          .setLabel("tags")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🏷️")
          .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
        new ButtonBuilder()
          .setCustomId("add-purchase")
          .setLabel("add purchase")
          .setEmoji("💰")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!(await hasAdminPermission(message.member, "add-purchase"))),
        new ButtonBuilder()
          .setCustomId("set-birthday")
          .setLabel("set birthday")
          .setEmoji("🎂")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!(await hasAdminPermission(message.member, "set-birthday"))),
        new ButtonBuilder()
          .setCustomId("view-streak")
          .setLabel("streaks")
          .setEmoji("📅")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("set-bal")
          .setLabel("set balance")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💰")
          .setDisabled(!(await hasAdminPermission(message.member, "set-balance"))),
        new ButtonBuilder()
          .setCustomId("set-bank")
          .setLabel("set bank")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💳")
          .setDisabled(!(await hasAdminPermission(message.member, "set-balance"))),
        new ButtonBuilder()
          .setCustomId("set-prestige")
          .setLabel("set prestige")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🌟")
          .setDisabled(!(await hasAdminPermission(message.member, "set-prestige"))),
        new ButtonBuilder()
          .setCustomId("set-level")
          .setLabel("set level")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("⭐")
          .setDisabled(!(await hasAdminPermission(message.member, "set-level"))),
        new ButtonBuilder()
          .setCustomId("set-xp")
          .setLabel("set xp")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✨")
          .setDisabled(!(await hasAdminPermission(message.member, "set-xp"))),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("set-inv")
          .setLabel("modify inventory")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🎒")
          .setDisabled(!(await hasAdminPermission(message.member, "set-inv"))),
        new ButtonBuilder()
          .setCustomId("set-karma")
          .setLabel("set karma")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔮")
          .setDisabled(!(await hasAdminPermission(message.member, "set-karma"))),
        new ButtonBuilder()
          .setCustomId("ecoban")
          .setLabel("economy ban")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
          .setDisabled(!(await hasAdminPermission(message.member, "ecoban"))),
        new ButtonBuilder()
          .setCustomId("blacklist")
          .setLabel("blacklist")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
          .setDisabled(!(await hasAdminPermission(message.member, "blacklist"))),
        new ButtonBuilder()
          .setCustomId("wipe")
          .setLabel("wipe")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🧹")
          .setDisabled(!(await hasAdminPermission(message.member, "wipe"))),
      ),
    ];

    let desc = `tag: ${user?.username}#${user?.discriminator}\nid: ${user?.id}\ncreated: <t:${Math.floor(
      user.createdTimestamp / 1000,
    )}:R>\nadmin level: ${await getAdminLevel(user.id)}`;

    if (!(await hasProfile(user))) desc += "\n**has no user profile**";

    if ((await isUserBlacklisted(user)).blacklisted) {
      rows[3].components[1].setDisabled(true);
      desc += "\n**currently blacklisted**";
    } else if ((await isEcoBanned(user)).banned) {
      desc += `\n**currently economy banned** - unbanned <t:${Math.floor((await getEcoBanTime(user.id)).getTime() / 1000)}:R>`;
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      `${user.username}'s discord data`,
    );

    const msg = await send({ embeds: [embed], components: rows });

    const waitForButton = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "db-data") {
        if (!(await hasAdminPermission(message.member, "user-db-data"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("user-db-data")],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} db data`,
        );

        const files = [await getDbData(user)];

        await res.editReply({ files });
        return waitForButton();
      } else if (res.customId === "cmds") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }
        const uses = await getCommandUses(user);
        const total = uses.map((x) => x.uses).reduce((a, b) => a + b);

        const daily = parseInt(await redis.hget(Constants.redis.nypsi.TOP_COMMANDS_USER, user.id));

        const embed = new CustomEmbed(
          message.member,
          `**total** ${total.toLocaleString()}\n**daily** ${daily.toLocaleString()}\n\n${uses
            .map((i) => `\`${i.command}\`: ${i.uses.toLocaleString()}`)
            .join("\n")}`,
        );

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} command data`,
        );

        await res.editReply({ embeds: [embed] });
        return waitForButton();
      } else if (res.customId === "view-premium") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} premium data`,
        );
        doPremium(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "set-admin") {
        if (!(await hasAdminPermission(message.member, "set-admin-level"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-admin-level")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter new admin level")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > (await getAdminLevel(message.member))) {
          await res.editReply({
            embeds: [
              new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN"),
            ],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) updated ${user.id} admin level to ${msg.content}`,
        );
        await setAdminLevel(user, parseInt(msg.content));
        await res.editReply({ embeds: [new CustomEmbed(message.member, "✅")] });
        return waitForButton();
      } else if (res.customId === "create-chat") {
        if (!(await hasAdminPermission(message.member, "create-chat"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("create-chat")],
          });
          return waitForButton();
        }

        const supportRequestResponse = await createSupportRequest(
          user.id,
          message.client as NypsiClient,
          user.username,
        );

        if (!supportRequestResponse) {
          await res.editReply({
            embeds: [new ErrorEmbed("failed to create support request")],
          });
          return waitForButton();
        }

        const userEmbed = new CustomEmbed(
          user.id,
          "a staff member has created a support ticket with you",
        );

        addNotificationToQueue({ memberId: user.id, payload: { embed: userEmbed } });

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "✅ support request created with user")],
        });

        return waitForButton();
      } else if (res.customId === "tags") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }

        doTags(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "add-purchase") {
        if (!(await hasAdminPermission(message.member, "add-purchase"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("add-purchase")],
          });
          return waitForButton();
        }
        await res.editReply({
          embeds: [new CustomEmbed(message.member, "<item> <source> <cost> (amount)")],
        });

        waitForButton();

        const msgResponse = await message.channel
          .awaitMessages({
            filter: (msg) => msg.author.id === message.author.id,
            max: 1,
            time: 60000,
          })
          .catch(() => {});

        if (!msgResponse) return;

        const args = msgResponse.first().content.split(" ");

        const item = args[0];
        const source = args[1];
        const cost = new Prisma.Decimal(args[2]);
        const amount = args[3];

        await prisma.purchases.create({
          data: {
            userId: user.id,
            cost,
            item,
            source,
            amount: amount ? parseInt(amount) : undefined,
          },
        });

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) created purchase for ${user.id} ${msgResponse.first().content}`,
        );

        if (getItems()[item]) {
          await addInventoryItem(user.id, item, amount ? parseInt(amount) : 1);
        }

        msgResponse.first().react("✅");
      } else if (res.customId === "set-birthday") {
        if (!(await hasAdminPermission(message.member, "set-birthday"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-birthday")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new birthday")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;

        const birthday = new Date(msg.content);

        if (isNaN(birthday as unknown as number)) {
          await res.editReply({
            embeds: [new ErrorEmbed("invalid date, use the format YYYY-MM-DD")],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} birthday to ${birthday}`,
        );
        await setBirthday(user, birthday);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "view-streak") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} streak info`,
        );
        doStreaks(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "set-bal") {
        if (!(await hasAdminPermission(message.member, "set-balance"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-balance")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              "enter a non stupid number pls remember if you do this for a joke this money could very easily be distributed between members & put into items",
            ),
          ],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} balance to ${msg.content}`,
        );
        await updateBalance(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-bank") {
        if (!(await hasAdminPermission(message.member, "set-balance"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-balance")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              "enter a non stupid number pls remember if you do this for a joke this money could very easily be distributed between members & put into items",
            ),
          ],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} bank balance to ${msg.content}`,
        );
        await updateBankBalance(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-prestige") {
        if (!(await hasAdminPermission(message.member, "set-prestige"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-prestige")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new prestige")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} prestige to ${msg.content}`,
        );
        await setPrestige(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-level") {
        if (!(await hasAdminPermission(message.member, "set-level"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-level")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new level")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} level to ${msg.content}`,
        );
        await setLevel(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-xp") {
        if (!(await hasAdminPermission(message.member, "set-xp"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-xp")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new xp value")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} xp to ${msg.content}`,
        );
        await updateXp(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-inv") {
        if (!(await hasAdminPermission(message.member, "set-inv"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-inv")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              "<item_id> <amount>\n\nprefix amount with `+` or `-` to increment/decrement",
            ),
          ],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} inventory item to ${msg.content}`,
        );

        if (!getItems()[msg.content.split(" ")[0]]) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid item")] });
          return waitForButton();
        }

        let mode: "increment" | "decrement" | "set" = "set";

        if (msg.content.split(" ")[1].startsWith("-")) {
          mode = "decrement";
        } else if (msg.content.split(" ")[1].startsWith("+")) {
          mode = "increment";
        }

        let amount: number;

        if (mode !== "set") {
          amount = parseInt(
            msg.content.split(" ")[1].substring(1, msg.content.split(" ")[1].length),
          );
        } else {
          amount = parseInt(msg.content.split(" ")[1]);
        }

        if (isNaN(amount) || amount < 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid amount")] });
          return waitForButton();
        }

        if (mode === "set") {
          await setInventoryItem(
            user,
            msg.content.split(" ")[0],
            parseInt(msg.content.split(" ")[1]),
          );
        } else if (mode === "increment") {
          await addInventoryItem(user, msg.content.split(" ")[0], amount);
        } else if (mode === "decrement") {
          await removeInventoryItem(user, msg.content.split(" ")[0], amount);
        }

        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-karma") {
        if (!(await hasAdminPermission(message.member, "set-karma"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-karma")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new karma value")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        const karma = await getKarma(user);

        let amount = 0;
        let remove = false;

        if (parseInt(msg.content) < karma) {
          remove = true;
          amount = karma - parseInt(msg.content);
        } else {
          amount = parseInt(msg.content) - karma;
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} karma to ${msg.content}`,
        );

        if (remove) await removeKarma(user, amount);
        else await addKarma(user, amount);

        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "ecoban") {
        if (!(await hasAdminPermission(message.member, "ecoban"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("ecoban")],
          });
          return waitForButton();
        }

        if ((await isEcoBanned(user)).banned) {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) removed ecoban for ${user.id} `,
          );
          await setEcoBan(user);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "removed ecoban")] });
          return;
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "ban length format pls")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;

        const time = new Date(Date.now() + getDuration(msg.content.toLowerCase()) * 1000);

        if (!time) {
          await res.editReply({ embeds: [new ErrorEmbed("invalid length")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} ecoban to ${msg.content}`,
        );
        await setEcoBan(user, time);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "blacklist") {
        if (!(await hasAdminPermission(message.member, "blacklist"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("blacklist")],
          });
          return waitForButton();
        }

        if ((await isUserBlacklisted(user)).blacklisted) {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) removed blacklist for ${user.id} `,
          );
          await setUserBlacklist(user, false);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user unblacklisted")] });
          return waitForButton();
        } else {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) added blacklist for ${user.id} `,
          );
          await setUserBlacklist(user, true);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user blacklisted")] });
          return waitForButton();
        }
      } else if (res.customId === "ac") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} ac data`,
        );
        doAnticheat(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "wipe") {
        if (!(await hasAdminPermission(message.member, "wipe"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("wipe")],
          });
          return waitForButton();
        }

        const confirmMsg = await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              `are you sure you want to wipe ${user.username} (${user.id})`,
            ),
          ],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("yes").setLabel("yes").setStyle(ButtonStyle.Danger),
            ),
          ],
        });

        const confirmRes = await confirmMsg
          .awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id,
            time: 15000,
            componentType: ComponentType.Button,
          })
          .catch(() => {});

        if (confirmRes && confirmRes.customId === "yes") {
          await confirmRes.reply({
            embeds: [new CustomEmbed(message.member, `wiping ${user.username} (${user.id})...`)],
          });

          logger.info(`admin: ${message.author.id} (${message.author.username}) wiping ${user.id}`);

          await prisma.inventory.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.economyWorker.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.farm.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.economyGuild
            .delete({
              where: {
                ownerId: user.id,
              },
            })
            .catch(() => {});

          await prisma.achievements.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.bakeryUpgrade.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.upgrades.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.customCar.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.booster.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.crafting.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.tags.deleteMany({
            where: {
              userId: user.id,
            },
          });

          await prisma.offer.deleteMany({
            where: {
              AND: [{ ownerId: user.id }, { sold: false }],
            },
          });

          await prisma.market.deleteMany({
            where: {
              AND: [{ ownerId: user.id }, { completed: false }],
            },
          });

          await prisma.economy.update({
            where: {
              userId: user.id,
            },
            data: {
              money: 0,
              bank: 0,
              bankStorage: 0,
              prestige: 0,
              level: 0,
              xp: 0,
            },
          });

          confirmRes.editReply({
            embeds: [
              new CustomEmbed(message.member, `wiping ${user.username} (${user.id})...\n\ndone`),
            ],
          });

          exec(`redis-cli KEYS "*${user.id}*" | xargs redis-cli DEL`);
        }
      }
    };
    return waitForButton();
  };

  const doPremium = async (user: User, response: ButtonInteraction) => {
    const render = async () => {
      let desc = "";

      const canSetPremium = await hasAdminPermission(message.member, "set-premium");

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("add-premium")
            .setLabel("add premium")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("➕")
            .setDisabled(!canSetPremium),
          new ButtonBuilder()
            .setCustomId("set-tier")
            .setLabel("set tier")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("😁")
            .setDisabled(!canSetPremium),
          new ButtonBuilder()
            .setCustomId("set-expire")
            .setLabel("set expire date")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("😣")
            .setDisabled(!canSetPremium),
          new ButtonBuilder()
            .setCustomId("set-credits")
            .setLabel("set credits")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🪙")
            .setDisabled(!canSetPremium),
          new ButtonBuilder()
            .setCustomId("raw-data")
            .setLabel("view raw data")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🥩")
            .setDisabled(!(await hasAdminPermission(message.member, "view-user-info"))),
        ),

        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("del-cmd")
            .setLabel("delete cmd")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(!(await hasAdminPermission(message.member, "delete-prem-cmd"))),
          new ButtonBuilder()
            .setCustomId("del-aliases")
            .setLabel("delete aliases")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(!(await hasAdminPermission(message.member, "delete-prem-aliases"))),
          new ButtonBuilder()
            .setCustomId("expire-now")
            .setLabel("expire now")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(!canSetPremium),
        ),
      ];

      const embed = new CustomEmbed(message.member);

      if (await isPremium(user)) {
        const [profile, aliases] = await Promise.all([
          getPremiumProfile(user),
          getUserAliases(user),
        ]);

        rows[0].components[0].setDisabled(true);
        desc +=
          `**level** ${levelString(profile.level)}\n` +
          `**expires** <t:${Math.floor(profile.expireDate.getTime() / 1000)}>\n` +
          `**credits** ${profile.credit}`;

        embed.setDescription(desc);
        if (aliases.length > 0) {
          embed.addField(
            "aliases",
            aliases.map((i) => `\`${i.alias}\` -> \`${i.command}\``).join("\n"),
          );
        }
      } else {
        rows.forEach((i) => i.components.forEach((j) => j.setDisabled(true)));

        if (canSetPremium) rows[0].components[0].setDisabled(false);

        embed.setDescription("no premium");
      }

      return { rows, embed };
    };

    const waitForButton = async (): Promise<void> => {
      const { rows, embed } = await render();

      const msg = await response.editReply({ embeds: [embed], components: rows });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "add-premium") {
        if (!(await hasAdminPermission(message.member, "set-premium"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-premium")],
          });
          return waitForButton();
        }

        if (await isPremium(user)) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "1-4?")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > 4 || parseInt(msg.content) < 1) {
          await res.editReply({
            embeds: [
              new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN"),
            ],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) added ${user.id} premium at level ${msg.content}`,
        );

        await addMember(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-tier") {
        if (!(await hasAdminPermission(message.member, "set-premium"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-premium")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user))) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "1-4?")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > 4 || parseInt(msg.content) < 1) {
          await res.editReply({
            embeds: [
              new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN"),
            ],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} premium tier to ${msg.content}`,
        );

        await setTier(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-expire") {
        if (!(await hasAdminPermission(message.member, "set-premium"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-premium")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user))) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "pls use format mm/dd/yyyy")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        const date = dayjs(msg.content);

        if (!date) {
          await res.editReply({
            embeds: [
              new ErrorEmbed(
                "invalid date you absolute fucking idiot like how do you mess that up are you actually like fucked in the head were you dropped on your head you special cunt go get a fucking helmet before I PUT A STICK IN YOUR CRANIUM YOU FUCKING WANKER",
              ),
            ],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${
            user.id
          } premium expire date to ${date.format()}`,
        );

        await setExpireDate(user, date.toDate());
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "raw-data") {
        if (!(await hasAdminPermission(message.member, "view-user-info"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("view-user-info")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} raw premium data`,
        );
        const profile = await getPremiumProfile(user);
        await res.editReply({
          embeds: [
            new CustomEmbed(message.member, `\`\`\`${JSON.stringify(profile, null, 2)}\`\`\``),
          ],
        });
        return waitForButton();
      } else if (res.customId === "del-cmd") {
        if (!(await hasAdminPermission(message.member, "delete-prem-cmd"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("delete-prem-cmd")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) deleted ${user.id} custom command`,
        );
        await prisma.premiumCommand.delete({ where: { owner: user.id } }).catch(() => {});
        await res.editReply({
          embeds: [new CustomEmbed(message.member, "deleted custom command")],
        });
        return waitForButton();
      } else if (res.customId === "del-aliases") {
        if (!(await hasAdminPermission(message.member, "delete-prem-aliases"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("delete-prem-aliases")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) deleted ${user.id} aliases`,
        );
        await prisma.userAlias.deleteMany({ where: { userId: user.id } });
        await redis.del(`${Constants.redis.cache.premium.ALIASES}:${user.id}`);
        await res.editReply({
          embeds: [new CustomEmbed(message.member, "deleted all aliases for that user")],
        });
        return waitForButton();
      } else if (res.customId === "expire-now") {
        if (!(await hasAdminPermission(message.member, "set-premium"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-premium")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} expire to now`,
        );
        await expireUser(user, message.client as NypsiClient);
        await res.editReply({ embeds: [new CustomEmbed(message.member, "done sir.")] });
        return waitForButton();
      } else if (res.customId === "set-credits") {
        if (!(await hasAdminPermission(message.member, "set-premium"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-premium")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user))) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "how many")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content) && parseInt(msg.content) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) < 0) {
          await res.editReply({
            embeds: [
              new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN"),
            ],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} premium credits to ${msg.content}`,
        );

        await setCredits(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      }
    };
    return waitForButton();
  };

  const doStreaks = async (user: User, response: ButtonInteraction) => {
    const render = async () => {
      const [daily, lastDaily, vote, lastVote, taskStreaks] = await Promise.all([
        getDailyStreak(user),
        getLastDaily(user),
        getVoteStreak(user),
        getLastVote(user),
        getTaskStreaks(message.member),
      ]);

      const canSetStreaks = await hasAdminPermission(message.member, "set-streak");

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("set-daily")
            .setLabel("set daily streak")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📅")
            .setDisabled(!canSetStreaks),
          new ButtonBuilder()
            .setCustomId("set-vote")
            .setLabel("set vote streak")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🗳")
            .setDisabled(!canSetStreaks),
          new ButtonBuilder()
            .setCustomId("set-daily-tasks")
            .setLabel("set daily task streak")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋")
            .setDisabled(!canSetStreaks),
          new ButtonBuilder()
            .setCustomId("set-weekly-tasks")
            .setLabel("set weekly task streak")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋")
            .setDisabled(!canSetStreaks),
        ),

        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("rerun-daily")
            .setLabel("rerun daily rewards")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📅")
            .setDisabled(!canSetStreaks || daily <= 0),
          new ButtonBuilder()
            .setCustomId("rerun-vote")
            .setLabel("rerun vote rewards")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🗳")
            .setDisabled(!canSetStreaks || vote <= 0),
        ),
      ];

      const embed = new CustomEmbed(message.member);
      embed.setDescription(
        `daily streak: **${daily.toLocaleString()}** (last daily <t:${Math.floor(lastDaily.getTime() / 1000)}>)\nvote streak: **${vote.toLocaleString()}** (last vote <t:${Math.floor(lastVote.getTime() / 1000)}>)` +
          `\n\ndaily task streak: **${taskStreaks.dailyTaskStreak.toLocaleString()}**\nweekly task streak: **${taskStreaks.weeklyTaskStreak.toLocaleString()}**`,
      );

      return { rows, embed };
    };

    const waitForButton = async (): Promise<void> => {
      const { rows, embed } = await render();

      const msg = await response.editReply({ embeds: [embed], components: rows });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "set-daily") {
        if (!(await hasAdminPermission(message.member, "set-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-streak")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter amount")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if ((!parseInt(msg.content) && parseInt(msg.content) != 0) || parseInt(msg.content) < 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} daily streak to ${msg.content}`,
        );

        await setDaily(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-vote") {
        if (!(await hasAdminPermission(message.member, "set-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-streak")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter amount")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if ((!parseInt(msg.content) && parseInt(msg.content) != 0) || parseInt(msg.content) < 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} vote streak to ${msg.content}`,
        );

        await setVoteStreak(user, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-daily-tasks") {
        if (!(await hasAdminPermission(message.member, "set-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-streak")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter amount")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if ((!parseInt(msg.content) && parseInt(msg.content) != 0) || parseInt(msg.content) < 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} daily task streak to ${msg.content}`,
        );

        await setTaskStreak(user, "daily", parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-weekly-tasks") {
        if (!(await hasAdminPermission(message.member, "set-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-streak")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter amount")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if ((!parseInt(msg.content) && parseInt(msg.content) != 0) || parseInt(msg.content) < 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} weekly task streak to ${msg.content}`,
        );

        await setTaskStreak(user, "weekly", parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "rerun-daily") {
        if (!(await hasAdminPermission(message.member, "run-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("run-streak")],
          });
          return waitForButton();
        }

        addNotificationToQueue({
          memberId: user.id,
          payload: { embed: await doDaily(user, false, 1, true) },
        });

        await res.editReply({ embeds: [new CustomEmbed(message.member, "rewards sent")] });

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) reran ${user.id} daily streak`,
        );

        return waitForButton();
      } else if (res.customId === "rerun-vote") {
        if (!(await hasAdminPermission(message.member, "run-streak"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("run-streak")],
          });
          return waitForButton();
        }

        const votes = await prisma.economy.update({
          where: {
            userId: user.id,
          },
          data: {
            monthVote: { increment: 1 },
            seasonVote: { increment: 1 },
          },
          select: {
            monthVote: true,
            seasonVote: true,
            voteStreak: true,
          },
        });

        await giveVoteRewards(user.id, votes);

        await res.editReply({ embeds: [new CustomEmbed(message.member, "rewards sent")] });

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) reran ${user.id} vote streak`,
        );

        return waitForButton();
      }
    };
    return waitForButton();
  };

  const doAnticheat = async (user: User, response: ButtonInteraction) => {
    const render = async () => {
      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("ac-hist")
            .setLabel("show data")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋")
            .setDisabled(!(await hasAdminPermission(message.member, "anticheat-history"))),
          new ButtonBuilder()
            .setCustomId("ac-clear")
            .setLabel("clear")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🗑️")
            .setDisabled(!(await hasAdminPermission(message.member, "clear-anticheat"))),
        ),

        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("captcha-hist")
            .setLabel("captcha history")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🤖")
            .setDisabled(!(await hasAdminPermission(message.member, "captcha-history"))),
          new ButtonBuilder()
            .setCustomId("give-captcha")
            .setLabel("give captcha")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🤖")
            .setDisabled(!(await hasAdminPermission(message.member, "captchatest"))),
        ),
      ];

      const embed = new CustomEmbed(message.member, "choose one");

      return { rows, embed };
    };

    const waitForButton = async (): Promise<void> => {
      const { rows, embed } = await render();

      const msg = await response.editReply({ embeds: [embed], components: rows });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "ac-hist") {
        if (!(await hasAdminPermission(message.member, "anticheat-history"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("anticheat-history")],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} ac data`,
        );

        const data = b(user.id);

        await fs.writeFile(
          `/tmp/nypsi_ac_${user.id}.txt`,
          JSON.stringify(
            data,
            (key, value) => {
              if (value instanceof Map) {
                return Array.from(value.entries());
              } else {
                return value;
              }
            },
            2,
          ),
        );

        await res.editReply({
          files: [
            {
              attachment: await fs.readFile(`/tmp/nypsi_ac_${user.id}.txt`),
              name: `nypsi_ac_${user.id}.txt`,
            },
          ],
        });
        return waitForButton();
      } else if (res.customId === "ac-clear") {
        if (!(await hasAdminPermission(message.member, "clear-anticheat"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("clear-anticheat")],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) cleared ${user.id} violations`,
        );

        c(user.id);
        await redis.del(`${Constants.redis.cache.user.captcha_pass}:${user.id}`);
        await redis.del(`${Constants.redis.cache.user.captcha_fail}:${user.id}`);

        await res.editReply({ content: "✅" });
        return waitForButton();
      } else if (res.customId === "give-captcha") {
        if (!(await hasAdminPermission(message.member, "captchatest"))) {
          res.followUp({ embeds: [requiredLevelEmbed("captchatest")] });
          return;
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) gave ${user} captcha`,
        );

        await giveCaptcha(user, 2, true);

        res.followUp({ content: "✅" });
        return waitForButton();
      } else if (res.customId === "captcha-hist") {
        if (!(await hasAdminPermission(message.member, "captcha-history"))) {
          res.followUp({ embeds: [requiredLevelEmbed("captcha-history")] });
          return;
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} captcha history`,
        );

        const history = await getCaptchaHistory(user);

        const embed = new CustomEmbed(message.member);

        const pages = PageManager.createPages(
          history.map((captcha) =>
            [
              "```",
              `received: ${captcha.received}`,
              `received at: ${dayjs(captcha.createdAt).format("HH:mm:ss")}`,
              `visits (${captcha.visits.length}): ${captcha.visits.map((i) => dayjs(i).format("HH:mm:ss")).join(" ")}`,
              `solved at: ${dayjs(captcha.solvedAt).format("HH:mm:ss")}`,
              `time taken: ${MStoTime(captcha.solvedAt.getTime() - captcha.createdAt.getTime())}`,
              `solved ip: ${captcha.solvedIp}`,
              "```",
            ].join("\n"),
          ),
          1,
        );

        embed.setDescription(pages.get(1).join("")).setFooter({ text: `1/${pages.size}` });

        const msg = await res.followUp({ embeds: [embed], components: [PageManager.defaultRow()] });

        const manager = new PageManager({
          embed,
          pages,
          message: msg,
          userId: message.author.id,
          row: PageManager.defaultRow(),
          allowMessageDupe: false,
          onPageUpdate(manager) {
            manager.embed.setFooter({ text: `${manager.currentPage}/${manager.lastPage}` });
            return manager.embed;
          },
        });

        manager.listen();
        return waitForButton();
      }
    };
    return waitForButton();
  };

  const doTags = async (user: User, response: ButtonInteraction) => {
    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("add-tag")
          .setLabel("add tag")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👍🏻")
          .setDisabled(!(await hasAdminPermission(message.member, "set-tags"))),
        new ButtonBuilder()
          .setCustomId("remove-tag")
          .setLabel("remove tag")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👎🏻")
          .setDisabled(!(await hasAdminPermission(message.member, "set-tags"))),
      ),
    ];

    const embed = new CustomEmbed(message.member);

    let tags = await getTags(user);

    embed.setDescription(
      `${tags.length > 0 ? `\`${tags.map((i) => i.tagId).join("` `")}\`` : "no tags"}`,
    );

    const msg = await response.editReply({ embeds: [embed], components: rows });

    const waitForButton = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "add-tag") {
        if (!(await hasAdminPermission(message.member, "set-tags"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-tags")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "what tag")] });

        const msgResponse = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msgResponse) return;

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) added ${msgResponse.content} tag to ${user.id}`,
        );

        tags = await addTag(user, msgResponse.content);

        msgResponse.react("✅");
        await msg.edit({
          embeds: [
            new CustomEmbed(
              message.member,
              `${tags.length > 0 ? `\`${tags.map((i) => i.tagId).join("` `")}\`` : "no tags"}`,
            ),
          ],
        });
        return waitForButton();
      } else if (res.customId === "remove-tag") {
        if (!(await hasAdminPermission(message.member, "set-tags"))) {
          await res.editReply({
            embeds: [requiredLevelEmbed("set-tags")],
          });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "what tag")] });

        const msgResponse = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msgResponse) return;

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) removed ${msgResponse.content} tag from ${user.id}`,
        );

        tags = await removeTag(user, msgResponse.content);

        msgResponse.react("✅");
        await msg.edit({
          embeds: [
            new CustomEmbed(
              message.member,
              `${tags.length > 0 ? `\`${tags.map((i) => i.tagId).join("` `")}\`` : "no tags"}`,
            ),
          ],
        });
        return waitForButton();
      }
    };
    return waitForButton();
  };

  const doFind = async (args: string[]) => {
    args.shift();

    const findGuild = async (message: NypsiMessage, guild: any) => {
      const owner = guild.ownerId;

      const invites = guild.invites.cache;

      const embed = new CustomEmbed(message.member)
        .setDescription(`\`${guild.id}\``)
        .setTitle(guild.name)
        .addField(
          "info",
          `**owner** ${owner}
            **created** ${dayjs(guild.createdTimestamp).format()}`,
          true,
        )
        .addField(
          "member info",
          `**members** ${guild.members.length}
    **peak** ${await getPeaks(guild)}`,
          true,
        ); // if guild.members.length works add members field back

      if (invites && invites.length > 0) {
        embed.addField(
          `invite (${invites.length})`,
          invites[Math.floor(Math.random() & invites.length)],
        );
      }

      return send({ embeds: [embed] });
    };

    const findUser = async (message: NypsiMessage, user: User) => {
      const embed = new CustomEmbed(message.member)
        .setTitle(user.username)
        .setDescription(
          `\`${user.id}\`${
            (await isPremium(user)) ? ` (${levelString(await getTier(user))}) ` : ""
          } ${(await isEcoBanned(user)).banned ? "[banned]" : ""}`,
        )
        .addField(
          "user",
          `**tag** ${user.username}
            **created** ${formatDate(user.createdAt)}${
              (await getLastCommand(user))
                ? `\n**last command** <t:${Math.floor(
                    (await getLastCommand(user)).getTime() / 1000,
                  )}:R>`
                : ""
            }`,
          true,
        )
        .setFooter({ text: `${await getKarma(user)} karma` });

      if (await userExists(user)) {
        const voted = await hasVoted(user);
        embed.addField(
          "economy",
          `💰 $**${(await getBalance(user)).toLocaleString()}**
            💳 $**${(await getBankBalance(user)).toLocaleString()}** / $**${(
              await getMaxBankBalance(user)
            ).toLocaleString()}**
      🌍 $**${(await calcNetWorth("find", user, user.client as NypsiClient)).amount.toLocaleString()}**
            **xp** ${(await getXp(user)).toLocaleString()}
            **voted** ${voted}
            **prestige** ${await getPrestige(user)}
            **bonus** ${Math.floor((await getGambleMulti(message.member, message.client as NypsiClient)).multi * 100)}%`,
          true,
        );
      }

      const usernameHistory = await fetchUsernameHistory(user);

      if (usernameHistory.length > 0) {
        let msg = "";

        let count = 0;
        for (const un of usernameHistory) {
          if (count >= 10) break;
          msg += `\`${un.value}\` | \`${formatDate(un.createdAt)}\`\n`;
          count++;
        }

        embed.addField("username history", msg, true);
      }

      return send({ embeds: [embed] });
    };

    const client = message.client as NypsiClient;

    if (args[0]?.toLowerCase() == "gid") {
      if (args.length == 1) return send({ embeds: [new ErrorEmbed("$x find gid <guildid>")] });

      if (args[2]?.toLowerCase() === "leave") {
        return client.cluster.broadcastEval(
          (c, { guildId }) => {
            const g = c.guilds.cache.get(guildId);

            if (g) return g.leave();
          },
          { context: { guildId: args[1] } },
        );
      }

      const guild: any = await client.cluster.broadcastEval(
        async (c, { guildId }) => {
          const g = c.guilds.cache.get(guildId);

          if (!g) return null;

          return g;
        },
        { context: { guildId: args[1] } },
      );

      let foundGuild: Guild;

      for (const res of guild) {
        if (res?.id) {
          foundGuild = res;
          break;
        }
      }

      if (!foundGuild) return message.react("❌");

      return findGuild(message, foundGuild);
    } else if (args[0]?.toLowerCase() == "gname") {
      if (args.length == 1) return send({ embeds: [new ErrorEmbed("$x find gname <guild name>")] });

      args.shift();

      const guild: any = await client.cluster.broadcastEval(
        (c, { guildId }) => {
          const g = c.guilds.cache.find((g) => g.name.includes(guildId));

          return g;
        },
        { context: { guildId: args.join(" ") } },
      );

      let foundGuild: Guild;

      for (const res of guild) {
        if (res?.id) {
          foundGuild = res;
          break;
        }
      }

      if (!foundGuild) return message.react("❌");

      return findGuild(message, foundGuild);
    } else if (args[0]?.toLowerCase() == "id") {
      if (args.length == 1) return send({ embeds: [new ErrorEmbed("$x find id <userid>")] });

      let user: any = await client.cluster.broadcastEval(
        async (c, { userId }) => {
          const g = await c.users.fetch(userId);

          return g;
        },
        { context: { userId: args[1] } },
      );

      for (const res of user) {
        if (res.username) {
          user = res;
          break;
        }
      }

      if (!user) return message.react("❌");

      return findUser(message, user);
    } else if (args[0]?.toLowerCase() == "name") {
      if (args.length == 1) return send({ embeds: [new ErrorEmbed("$x find name <username>")] });

      args.shift();

      let user: any = await client.cluster.broadcastEval(
        async (c, { userId }) => {
          const g = c.users.cache.find((u) => {
            return `${u.username}`.includes(userId);
          });

          return g;
        },
        { context: { userId: args.join(" ") } },
      );

      for (const res of user) {
        if (!res) continue;
        if (res.username) {
          user = res;
          break;
        }
      }

      if (!user || user instanceof Array) return message.react("❌");

      return findUser(message, user);
    } else if (args[0]?.toLowerCase() == "nearby") {
      if (args.length == 1) return send({ embeds: [new ErrorEmbed("$x find nearby <query>")] });

      const search = args.slice(1);

      const results = await getMember(message.guild, search.join(" "), true);

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            results.length
              ? `\`${results.map((i) => `${i.username} - ${i.score}`).join("`\n`")}\``
              : "no results found",
          ),
        ],
      });
    } else if (args[0]?.toLowerCase() == "top") {
      const balTop = await topBalanceGlobal(15, false);

      const embed = new CustomEmbed(message.member, balTop.join("\n")).setTitle(
        "top " + balTop.length,
      );

      return send({ embeds: [embed] });
    } else
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            [
              "**$x find gid <id>** - find guild by id",
              "**$x find gname <name>** - find guild by name",
              "**$x find id <userid>** - find user by id",
              "**$x find name <username>** - find user by username",
              "**$x find nearby <query>** - debug member targeting",
              "**$x find top** - find the top 15 balance",
            ].join("\n"),
          ),
        ],
      });
  };

  const doCaptcha = async (args: string[]) => {
    args.shift();

    let verify = false;

    if (args.length == 2 && args[0].toLowerCase() == "verify") {
      args.shift();
      verify = true;
    }

    const target = await getUserFromId(args[0]);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (verify) {
      const res = await isLockedOut(target);

      if (!res) {
        return message.react("➖");
      }

      const captcha = await prisma.captcha.update({
        where: { id: res.id },
        data: {
          solved: true,
          solvedAt: new Date(),
        },
      });

      await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${target.id}`);
      await passedCaptcha(target, captcha, true);
      await redis.del(`${Constants.redis.cache.user.CAPTCHA_HISTORY}:${target.id}`);

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) force verified ${target.id} captcha`,
      );
      return message.react("✅");
    }

    giveCaptcha(target, 2, true);
    logger.info(
      `admin: ${message.author.id} (${message.author.username}) gave ${target.id} captcha`,
    );
    return message.react("✅");
  };

  const doForcelose = async (id: string) => {
    const target = await getUserFromId(id);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, target.id)) {
      await redis.srem(Constants.redis.nypsi.FORCE_LOSE, target.id);

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) set ${target.id} forcelose to false`,
      );

      return message.react("➖");
    } else {
      await redis.sadd(Constants.redis.nypsi.FORCE_LOSE, target.id);

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) set ${target.id} forcelose to true`,
      );

      return message.react("➕");
    }
  };

  const doCmdWatch = async (id: string, cmd: string) => {
    const target = await getUserFromId(id);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!commandExists(cmd)) {
      if (commandAliasExists(cmd)) {
        cmd = getCommandFromAlias(cmd);
      } else return send({ embeds: [new ErrorEmbed("invalid command")] });
    }

    if (await redis.exists(`${Constants.redis.nypsi.COMMAND_WATCH}:${id}:${cmd}`)) {
      await redis.del(`${Constants.redis.nypsi.COMMAND_WATCH}:${id}:${cmd}`);
      await message.react("➖");
    } else {
      await redis.set(`${Constants.redis.nypsi.COMMAND_WATCH}:${id}:${cmd}`, "t");
      await message.react("➕");
    }

    logger.info(
      `admin: ${message.author.id} (${message.author.username}) toggled command watch - ${args.join(
        " ",
      )}`,
    );
  };

  const doEcoban = async (args: string[]) => {
    args.shift();

    const target = await getUserFromId(args[0]);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!args[1]) {
      if ((await isEcoBanned(target)).banned) {
        await setEcoBan(target); // unbans user
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${target.id} ecoban to unban`,
        );
      }
    } else {
      const time = new Date(Date.now() + getDuration(args[1].toLowerCase()) * 1000);

      await setEcoBan(target, time);

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) set ${target.id} ecoban to ${time}`,
      );
    }

    return message.react("✅");
  };

  const doBlacklist = async (id: string) => {
    const target = await getUserFromId(id);

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if ((await isUserBlacklisted(target)).blacklisted) {
      await setUserBlacklist(target, false);
      logger.info(
        `admin: ${message.author.id} (${message.author.username}) removed blacklist from ${target.id}`,
      );
    } else {
      await setUserBlacklist(target, true);
      logger.info(
        `admin: ${message.author.id} (${message.author.username}) blacklisted ${target.id}`,
      );
    }

    return message.react("✅");
  };

  const addCmd = async () => {
    const category = (await message.guild.channels.fetch("1246516186171314337")) as CategoryChannel;
    const archive = (await message.guild.channels.fetch("1060585526945665197")) as CategoryChannel;

    const { children } = category;

    const name = `cmds-${children.cache.size + 1}`;

    let channel: TextChannel;

    const archivedChannel = archive.children.cache.find((i) => i.name === name) as TextChannel;

    if (archivedChannel) {
      await archivedChannel.setParent("1246516186171314337");

      channel = archivedChannel;
    } else {
      channel = await children.create({ name, type: ChannelType.GuildText });
    }

    console.log(children.cache.size);

    console.log(channel.position);

    await channel.setPosition(children.cache.size - 1);

    console.log(channel.position);

    logger.info(`admin: ${message.author.id} (${message.author.username}) added cmd channel`);

    return message.react("✅");
  };

  const remCmd = async () => {
    const category = (await message.guild.channels.fetch("1246516186171314337")) as CategoryChannel;

    const { children } = category;

    logger.debug(
      "children",
      children.cache.map((v) => ({ name: v.name, position: v.position })),
    );

    const filtered = Array.from(
      children.cache.filter((channel) => channel.name.startsWith("cmds-")).values(),
    );

    const ordered = sort(filtered).desc((i) => parseInt(i.name.split("-")[1]));

    const toDelete = ordered[0];

    await toDelete.setParent("1060585526945665197"); // archive

    logger.info(`admin: ${message.author.id} (${message.author.username}) removed cmd channel`);

    return message.react("✅");
  };

  const requestProfileTransfer = async (from: User, to: User) => {
    if (await hasProfile(to))
      return send({
        embeds: [new ErrorEmbed(`${to.username} has a nypsi profile, ask them to do /data delete`)],
      });

    if (!(await hasProfile(from)))
      return send({
        embeds: [new ErrorEmbed(`${from.username} doesn't have a nypsi profile you fucking idiot`)],
      });

    const guild = await getGuildByUser(from.id);

    if (guild.ownerId === from.id)
      return send({ embeds: [new ErrorEmbed("user is owner of a guild")] });

    await redis.set(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${to.id}`, from.id, "EX", 600);
    await redis.set(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${from.id}`, to.id, "EX", 600);

    addNotificationToQueue(
      {
        memberId: from.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `your profile has been requested to be transferred to ${to.id}, you cannot do commands during this period`,
          ),
          content: "IMPORTANT: your profile is being used in a data transfer",
        },
      },
      {
        memberId: to.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `your account has been requested to have data transferred from ${from.id} to you. if this was not you, you can safely ignore this message.\n\nyou cannot do commands for 10 minutes`,
          ),
          content: "IMPORTANT: your profile is being used in a data transfer",
          components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("confirm")
              .setCustomId("t-f-p-boobies"),
          ),
        },
      },
    );

    return send({
      embeds: [new CustomEmbed(message.member, "profile transfer initiated")],
    });
  };

  const startEvent = async () => {
    if (args.length < 4) {
      return send({ embeds: [new ErrorEmbed("$x event <type> <target> <days>")] });
    }

    const type = args[1];
    const target = parseInt(args[2]);
    const days = parseInt(args[3]);

    if (!getEventsData()[type]) {
      return send({ embeds: [new ErrorEmbed("invalid event type")] });
    }

    if (isNaN(target) || target < 1) {
      return send({ embeds: [new ErrorEmbed("invalid target")] });
    }

    if (isNaN(days) || days < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount of days")] });
    }

    const confirmMessage = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `confirm you want to start a ${type} event with target of ${target} for ${days} days`,
        ),
      ],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Danger)
            .setLabel("confirm")
            .setCustomId("event-confirm"),
        ),
      ],
    });

    const response = await confirmMessage
      .awaitMessageComponent({
        filter: (i) => i.user.id == message.author.id,
        time: 15000,
        componentType: ComponentType.Button,
      })
      .catch(async () => {});

    if (!response) {
      return send({ embeds: [new ErrorEmbed("confirmation cancelled")] });
    }

    const currentEvent = await getCurrentEvent(false);

    if (currentEvent) {
      return response.reply({
        embeds: [new ErrorEmbed("there is already an event running")],
      });
    }

    const eventRes = await createEvent(
      message.client as NypsiClient,
      message.member,
      type,
      target,
      days,
    );

    if (typeof eventRes == "string") {
      return response.reply({ embeds: [new ErrorEmbed(eventRes)] });
    }

    return response.reply({
      embeds: [new CustomEmbed(message.member, "event has started!!")],
    });
  };

  if (args.length == 0) {
    return send({
      embeds: [new CustomEmbed(message.member, await getUsableCommands(message.member))],
    });
  } else if (args[0].toLowerCase() == "userid") {
    if (!(await hasAdminPermission(message.member, "view-user-info"))) {
      return send({
        embeds: [requiredLevelEmbed("view-user-info")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x userid <id>")] });
    }

    return showUser(args[1]);
  } else if (args[0].toLowerCase() == "find") {
    if (!(await hasAdminPermission(message.member, "find"))) {
      return send({
        embeds: [requiredLevelEmbed("find")],
      });
    }

    return doFind(args);
  } else if (args[0].toLowerCase() == "captcha") {
    if (!(await hasAdminPermission(message.member, "captchatest"))) {
      return send({
        embeds: [requiredLevelEmbed("captchatest")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x captcha (verify) <id>")] });
    }

    return doCaptcha(args);
  } else if (args[0].toLowerCase() == "forcelose") {
    if (!(await hasAdminPermission(message.member, "forcelose"))) {
      return send({
        embeds: [requiredLevelEmbed("forcelose")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x forcelose <id>")] });
    }

    return doForcelose(args[1]);
  } else if (args[0].toLowerCase() == "cmdwatch") {
    if (!(await hasAdminPermission(message.member, "cmdwatch"))) {
      return send({
        embeds: [requiredLevelEmbed("cmdwatch")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x cmdwatch <id> <cmd>")] });
    }

    return doCmdWatch(args[1], args[2]);
  } else if (args[0].toLowerCase() == "ecoban") {
    if (!(await hasAdminPermission(message.member, "ecoban"))) {
      return send({
        embeds: [requiredLevelEmbed("ecoban")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x ecoban <id>")] });
    }

    return doEcoban(args);
  } else if (args[0].toLowerCase() == "blacklist") {
    if (!(await hasAdminPermission(message.member, "blacklist"))) {
      return send({
        embeds: [requiredLevelEmbed("blacklist")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("$x blacklist <id>")] });
    }

    return doBlacklist(args[1]);
  } else if (args[0].toLowerCase() === "transfer") {
    if (!(await hasAdminPermission(message.member, "profile-transfer"))) {
      return send({
        embeds: [requiredLevelEmbed("profile-transfer")],
      });
    }

    const fromId = args[1];
    const toId = args[2];

    const fromUser = await message.client.users.fetch(fromId).catch(() => {});
    const toUser = await message.client.users.fetch(toId).catch(() => {});

    if (!fromUser) return send({ embeds: [new ErrorEmbed("invalid from user")] });
    if (!toUser) return send({ embeds: [new ErrorEmbed("invalid to user")] });

    return requestProfileTransfer(fromUser, toUser);
  } else if (args[0].toLowerCase() === "drop") {
    if (!(await hasAdminPermission(message.member, "spawn-lootdrop"))) {
      return send({
        embeds: [requiredLevelEmbed("spawn-lootdrop")],
      });
    }

    startRandomDrop(message.client as NypsiClient, message.channelId);
  } else if (args[0].toLowerCase() === "fixcrash") {
    if (!(await hasAdminPermission(message.member, "fix-crash"))) {
      return send({
        embeds: [requiredLevelEmbed("fix-crash")],
      });
    }
    await redis.del(Constants.redis.nypsi.CRASH_STATUS);
    await initCrashGame(message.client as NypsiClient);
  } else if (args[0].toLowerCase() === "streakpause") {
    if (!(await hasAdminPermission(message.member, "streakpause"))) {
      return send({
        embeds: [requiredLevelEmbed("streakpause")],
      });
    }

    if (args.length === 1) {
      await redis.set("nypsi:streakpause", 69, "EX", ms("1 day") / 1000);
      return send({
        embeds: [new CustomEmbed(message.member, "✅ streaks won't be lost for the next 24 hours")],
      });
    } else if (args[1].toLowerCase() === "end") {
      await redis.del("nypsi:streakpause");
      return (message as Message).react("✅");
    } else
      return send({
        embeds: [new ErrorEmbed("$x streakpause (end)")],
      });
  } else if (args[0].toLowerCase() === "findalts") {
    if (!(await hasAdminPermission(message.member, "find-alts"))) {
      return send({
        embeds: [requiredLevelEmbed("find-alts")],
      });
    }

    const captchas = await prisma.captcha.findMany({
      where: {
        solvedIp: { not: null },
      },
      select: {
        userId: true,
        solvedIp: true,
      },
      distinct: ["userId"],
    });

    const map = new Map<string, string[]>();

    for (const captcha of captchas) {
      if (map.has(captcha.solvedIp)) {
        map.get(captcha.solvedIp).push(captcha.userId);
      } else {
        map.set(captcha.solvedIp, [captcha.userId]);
      }
    }

    // idk how this should be done lol i might get back to it

    console.log(map);
  } else if (args[0].toLowerCase() === "cmd") {
    if (!(await hasAdminPermission(message.member, "set-cmd-channels"))) {
      return send({
        embeds: [requiredLevelEmbed("set-cmd-channels")],
      });
    }

    if (args[1]?.toLowerCase() != "add" && args[1]?.toLowerCase() != "rem") {
      return send({ embeds: [new ErrorEmbed("$x cmd <add/rem>")] });
    }

    if (message.guildId !== Constants.NYPSI_SERVER_ID) {
      return send({
        embeds: [new ErrorEmbed("this can only be done in the nypsi server")],
      });
    }

    return args[1].toLowerCase() == "add" ? addCmd() : remCmd();
  } else if (args[0].toLowerCase() === "runjob") {
    if (!(await hasAdminPermission(message.member, "run-job"))) {
      return send({
        embeds: [requiredLevelEmbed("run-job")],
      });
    }

    if (args.length == 1) {
      (message.client as NypsiClient).cluster.send("reload_jobs");

      logger.info(`admin: ${message.author.id} (${message.author.username}) reloaded jobs`);
    } else {
      (message.client as NypsiClient).cluster.send(
        `trigger_job_${args.slice(1).join(" ").toLowerCase()}`,
      );

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) ran job ${args.slice(1).join(" ").toLowerCase()}`,
      );
    }

    return message.react("✅");
  } else if (["transaction", "tx"].includes(args[0].toLowerCase())) {
    if (!(await hasAdminPermission(message.member, "view-transactions"))) {
      return send({
        embeds: [requiredLevelEmbed("view-transactions")],
      });
    }

    if (args[1]?.toLowerCase() === "query") {
      if (args.length < 4) {
        return send({
          embeds: [
            new CustomEmbed(
              message.member,
              "$x tx query <source id | any> <target id | any>",
            ).setHeader("transactions"),
          ],
        });
      }

      const sourceId = args[2];
      const targetId = args[3];

      const query: Prisma.TransactionFindManyArgs["where"] = {};

      if (sourceId !== "any" && targetId !== "any") {
        query.AND = [
          {
            sourceId,
          },
          {
            targetId,
          },
        ];
      } else if (sourceId === "any" && targetId !== "any") {
        query.targetId = targetId;
      } else if (sourceId !== "any" && targetId === "any") {
        query.sourceId = sourceId;
      } else {
        return send({ embeds: [new ErrorEmbed("invalid query")] });
      }

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) queried transactions ${sourceId} -> ${targetId}`,
      );

      const test = await prisma.transaction.findMany({ where: query, take: 1 });

      if (test.length < 1) {
        return send({ embeds: [new ErrorEmbed("no transactions found")] });
      }

      const file = await exportTransactions(query);

      return send({
        files: [new AttachmentBuilder(file, { name: "transactions.txt" })],
      });
    } else if (args[1]?.toLowerCase() === "analytics") {
      if (args.length < 4) {
        return send({
          embeds: [
            new CustomEmbed(message.member, "$x tx analytics <source|target> <user id>").setHeader(
              "transactions",
            ),
          ],
        });
      }

      const type = args[2];
      const userId = args[3];

      if (type !== "source" && type !== "target") {
        return send({ embeds: [new ErrorEmbed("invalid type")] });
      }

      const count = await prisma.transaction.count({
        where: {
          [type === "source" ? "sourceId" : "targetId"]: userId,
        },
      });

      logger.info(
        `admin: ${message.author.id} (${message.author.username}) queried analytics ${type} ${userId}`,
      );

      if (count === 0) {
        return send({ embeds: [new ErrorEmbed("no transactions found")] });
      }

      const byOpposite = await prisma.transaction.groupBy({
        where: {
          [type === "source" ? "sourceId" : "targetId"]: userId,
        },
        by: [type === "source" ? "targetId" : "sourceId"],
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 5,
      });

      const oppositeFormatted: string[] = [];

      for (const opposite of byOpposite) {
        const username = await getLastKnownUsername(
          opposite[type === "source" ? "targetId" : "sourceId"],
        );
        const percentage = ((opposite._count.id / count) * 100).toFixed(2);
        oppositeFormatted.push(
          `${username} (\`${opposite[type === "source" ? "targetId" : "sourceId"]}\`) \`${percentage}%\` (${opposite._count.id.toLocaleString()})`,
        );
      }

      const embed = new CustomEmbed(
        message.member,
        `${count.toLocaleString()} total transactions\n\n${oppositeFormatted.join("\n")}`,
      ).setHeader(`analytics for ${await getLastKnownUsername(userId)} (${userId})`);

      return send({ embeds: [embed] });
    } else {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "$x tx query <source id | any> <target id | any>\n" +
              "$x tx analytics <source|target> <user id>",
          ).setHeader("transactions"),
        ],
      });
    }
  } else if (args[0].toLowerCase() === "reseteco") {
    if (!(await hasAdminPermission(message.member, "reseteco"))) {
      return send({
        embeds: [requiredLevelEmbed("reseteco")],
      });
    }

    const embed = new CustomEmbed(message.member, "run that command again");

    await send({ embeds: [embed] });

    const code = Math.floor(Math.random() * 10000);
    console.log(code);

    const filter = (msg: Message) => message.author.id == msg.author.id;

    let response: any = await message.channel.awaitMessages({
      filter,
      max: 1,
    });

    response = response.first().content;

    if (response != code) {
      return send({ embeds: [new ErrorEmbed("captcha failed")] });
    } else {
      const c = await reset();

      return send({
        embeds: [new CustomEmbed(message.member, `${c} users reset`)],
      });
    }
  } else if (args[0].toLowerCase() === "event") {
    if (!(await hasAdminPermission(message.member, "create-event"))) {
      return send({
        embeds: [requiredLevelEmbed("create-event")],
      });
    }

    return startEvent();
  } else {
    return send({
      embeds: [new CustomEmbed(message.member, await getUsableCommands(message.member))],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;

async function getUsableCommands(member: MemberResolvable) {
  const commands: { command: string; description: string; permission: AdminPermission }[] = [
    {
      command: "$x userid <id>",
      description: "view/edit discord and db info",
      permission: "view-user-info",
    },
    {
      command: "$x find",
      description: "find data about users or guilds",
      permission: "find",
    },
    {
      command: "$x captcha (verify) <id>",
      description: "give a user a captcha",
      permission: "captchatest",
    },
    {
      command: "$x forcelose <id>",
      description: "toggle whether a user will always lose games",
      permission: "forcelose",
    },
    {
      command: "$x cmdwatch <id> <cmd>",
      description: "watch a players usage of a command",
      permission: "cmdwatch",
    },
    {
      command: "$x tx",
      description: "view a user's transactions",
      permission: "view-transactions",
    },
    {
      command: "$x ecoban <id> [time]",
      description: "ban a user from economy (no time removes ban)",
      permission: "ecoban",
    },
    {
      command: "$x blacklist <id>",
      description: "blacklist a user from interacting with nypsi",
      permission: "blacklist",
    },
    {
      command: "$x transfer <from id> <to id>",
      description: "start a profile transfer",
      permission: "profile-transfer",
    },
    {
      command: "$x drop",
      description: "start a random drop",
      permission: "spawn-lootdrop",
    },
    {
      command: "$x fixcrash",
      description: "reinitialise crash",
      permission: "fix-crash",
    },
    {
      command: "$x streakpause (end)",
      description: "pause streak losses for 24 hours",
      permission: "streakpause",
    },
    {
      command: "$x cmd <add/rem>",
      description: "add or remove a cmds channel",
      permission: "set-cmd-channels",
    },
    {
      command: "$x runjob [name]",
      description: "run a job (no name to reload jobs)",
      permission: "reseteco",
    },
    {
      command: "$x reseteco",
      description: "reset the nypsi economy",
      permission: "reseteco",
    },
    {
      command: "$x event <type> <target> <days>",
      description: "start an event",
      permission: "create-event",
    },
  ];

  const permittedCommands = await Promise.all(
    commands.map(async (cmd) => {
      return (await hasAdminPermission(member, cmd.permission)) ? cmd : undefined;
    }),
  );

  return permittedCommands
    .filter((cmd) => cmd !== undefined)
    .map((cmd) => `**${cmd.command}** - ${cmd.description}`)
    .join("\n");
}
