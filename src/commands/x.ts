import dayjs = require("dayjs");
import { Prisma } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import * as fs from "fs/promises";
import { promisify } from "util";
import { gzip } from "zlib";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { startRandomDrop } from "../scheduled/clusterjobs/random-drops";
import Constants from "../utils/Constants";
import { b, c } from "../utils/functions/anticheat";
import { giveCaptcha } from "../utils/functions/captcha";
import { updateBalance, updateBankBalance } from "../utils/functions/economy/balance";
import { initCrashGame } from "../utils/functions/economy/crash";
import { setInventoryItem } from "../utils/functions/economy/inventory";
import { setLevel, setPrestige } from "../utils/functions/economy/levelling";
import { getEcoBanTime, getItems, isEcoBanned, setEcoBan } from "../utils/functions/economy/utils";
import { updateXp } from "../utils/functions/economy/xp";
import { addKarma, getKarma, removeKarma } from "../utils/functions/karma/karma";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { getUserAliases } from "../utils/functions/premium/aliases";
import {
  addMember,
  expireUser,
  getPremiumProfile,
  isPremium,
  levelString,
  setCredits,
  setExpireDate,
  setTier,
} from "../utils/functions/premium/premium";
import { getAdminLevel, setAdminLevel } from "../utils/functions/users/admin";
import { isUserBlacklisted, setUserBlacklist } from "../utils/functions/users/blacklist";
import { getCommandUses } from "../utils/functions/users/commands";
import { getEmail, getTotalSpend } from "../utils/functions/users/email";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { addTag, getTags, removeTag } from "../utils/functions/users/tags";
import { hasProfile } from "../utils/functions/users/utils";
import { logger } from "../utils/logger";

const cmd = new Command("x", "admincmd", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(message instanceof Message)) return;
  if ((await getAdminLevel(message.author.id)) < 1) {
    if (message.member.roles.cache.has("1023950187661635605")) {
      if (args[0].toLowerCase() !== "review") {
        if (await redis.exists("nypsi:xemoji:cooldown")) return;
        await redis.set("nypsi:xemoji:cooldown", "boobies", "EX", 5);
        return message.react(
          ["🫦", "💦", "🍑", "🍆", "😩"][
            Math.floor(Math.random() * ["🫦", "💦", "🍑", "🍆", "😩"].length)
          ],
        );
      }
    } else {
      if (await redis.exists("nypsi:xemoji:cooldown")) return;
      await redis.set("nypsi:xemoji:cooldown", "boobies", "EX", 5);
      return message.react(
        ["🫦", "💦", "🍑", "🍆", "😩"][
          Math.floor(Math.random() * ["🫦", "💦", "🍑", "🍆", "😩"].length)
        ],
      );
    }
  }

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
              Auction: true,
              BakeryUpgrade: true,
              EconomyGuildMember: true,
              OffersGiven: true,
              Upgrades: true,
              OffersReceived: true,
              auctionWatch: true,
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
          WordleStats: true,
          Preferences: true,
          CommandUse: true,
          Achievements: true,
          DMSettings: true,
          KofiPurchases: true,
          ActiveChannels: true,
          Leaderboards: true,
          Tags: true,
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
    const res = await (message.client as NypsiClient).cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.fetch(userId);

        return g;
      },
      { context: { userId: id } },
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

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("db-data")
          .setLabel("view all db data")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💻"),
        new ButtonBuilder()
          .setCustomId("cmds")
          .setLabel("command count")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("⌨️"),
        new ButtonBuilder()
          .setCustomId("view-premium")
          .setLabel("premium")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💎"),
        new ButtonBuilder()
          .setCustomId("set-admin")
          .setLabel("set admin level")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👨🏻‍💼"),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("ac")
          .setLabel("anticheat")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🤥"),
        new ButtonBuilder()
          .setCustomId("tags")
          .setLabel("tags")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🏷️"),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("set-bal")
          .setLabel("set balance")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💰"),
        new ButtonBuilder()
          .setCustomId("set-bank")
          .setLabel("set bank")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💳"),
        new ButtonBuilder()
          .setCustomId("set-prestige")
          .setLabel("set prestige")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🌟"),
        new ButtonBuilder()
          .setCustomId("set-level")
          .setLabel("set level")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("⭐"),
        new ButtonBuilder()
          .setCustomId("set-xp")
          .setLabel("set xp")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✨"),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("set-inv")
          .setLabel("modify inventory")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🎒"),
        new ButtonBuilder()
          .setCustomId("set-karma")
          .setLabel("set karma")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔮"),
        new ButtonBuilder()
          .setCustomId("ecoban")
          .setLabel("economy ban")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
        new ButtonBuilder()
          .setCustomId("blacklist")
          .setLabel("blacklist")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      ),
    ];

    let desc = `tag: ${user?.username}#${user?.discriminator}\nid: ${user?.id}\ncreated: <t:${Math.floor(
      user.createdTimestamp / 1000,
    )}:R>\nadmin level: ${await getAdminLevel(user.id)}`;

    if (!(await hasProfile(user.id))) desc += "\n**has no user profile**";

    if (await isUserBlacklisted(user.id)) {
      rows[3].components[1].setDisabled(true);
      desc += "\n**currently blacklisted**";
    } else if ((await isEcoBanned(user.id)).banned) {
      desc += `\n**currently economy banned** - unbanned <t:${Math.floor((await getEcoBanTime(user.id)).getTime() / 1000)}:R>`;
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      `${user.username}'s discord data`,
    );

    const msg = await message.channel.send({ embeds: [embed], components: rows });

    const waitForButton = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "db-data") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **1** to do this")],
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
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **1** to do this")],
          });
          return waitForButton();
        }
        const uses = await getCommandUses(user.id);
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
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **1** to do this")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} premium data`,
        );
        doPremium(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "set-admin") {
        if ((await getAdminLevel(message.author.id)) < 69) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **69** to do this")],
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
        if (parseInt(msg.content) > (await getAdminLevel(message.author.id))) {
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
        await setAdminLevel(user.id, parseInt(msg.content));
        await res.editReply({ embeds: [new CustomEmbed(message.member, "✅")] });
        return waitForButton();
      } else if (res.customId === "tags") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
          });
          return waitForButton();
        }

        doTags(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "set-bal") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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
        await updateBalance(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-bank") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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
        await updateBankBalance(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-prestige") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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
        await setPrestige(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-level") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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
        await setLevel(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-xp") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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
        await updateXp(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-inv") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
          });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "<item_id> <amount>")],
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

        if (!parseInt(msg.content.split(" ")[1]) && parseInt(msg.content.split(" ")[1]) != 0) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid number")] });
          return waitForButton();
        }

        if (
          (["crate", "scratch-card"].includes(getItems()[msg.content.split(" ")[0]].role) ||
            msg.content.split(" ").includes("credit")) &&
          (await getAdminLevel(message.author.id)) < 10
        ) {
          await res.editReply({
            embeds: [
              new ErrorEmbed("nice try LOSER HAHAHAHHAHAHAHAHAAHHAHAHAH wanker.").setImage(
                "https://giphy.com/clips/thefastsaga-fast-and-furious-saga-fate-of-the-Pv2AsOz7eYUkAqh1d5",
              ),
            ],
          });
          return waitForButton();
        }

        await setInventoryItem(
          user.id,
          msg.content.split(" ")[0],
          parseInt(msg.content.split(" ")[1]),
        );
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-karma") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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

        const karma = await getKarma(user.id);

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
        remove ? await removeKarma(user.id, amount) : addKarma(user.id, amount);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "ecoban") {
        if ((await getAdminLevel(message.author.id)) < 2) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **2** to do this")],
          });
          return waitForButton();
        }

        if ((await isEcoBanned(user.id)).banned) {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) removed ecoban for ${user.id} `,
          );
          await setEcoBan(user.id);
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
        await setEcoBan(user.id, time);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "blacklist") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **3** to do this")],
          });
          return waitForButton();
        }

        if (await isUserBlacklisted(user.id)) {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) removed blacklist for ${user.id} `,
          );
          await setUserBlacklist(user.id, false);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user unblacklisted")] });
          return waitForButton();
        } else {
          logger.info(
            `admin: ${message.author.id} (${message.author.username}) added blacklist for ${user.id} `,
          );
          await setUserBlacklist(user.id, true);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user blacklisted")] });
          return waitForButton();
        }
      } else if (res.customId === "ac") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **1** to do this")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} ac data`,
        );
        doAnticheat(user, res as ButtonInteraction);
        return waitForButton();
      }
    };
    return waitForButton();
  };

  const doPremium = async (user: User, response: ButtonInteraction) => {
    const render = async () => {
      let desc = "";

      const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("add-premium")
            .setLabel("add premium")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("➕"),
          new ButtonBuilder()
            .setCustomId("set-tier")
            .setLabel("set tier")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("😁"),
          new ButtonBuilder()
            .setCustomId("set-expire")
            .setLabel("set expire date")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("😣"),
          new ButtonBuilder()
            .setCustomId("set-credits")
            .setLabel("set credits")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🪙"),
          new ButtonBuilder()
            .setCustomId("raw-data")
            .setLabel("view raw data")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🥩"),
        ),

        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("del-cmd")
            .setLabel("delete cmd")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
          new ButtonBuilder()
            .setCustomId("del-aliases")
            .setLabel("delete aliases")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
          new ButtonBuilder()
            .setCustomId("expire-now")
            .setLabel("expire now")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
        ),
      ];

      const embed = new CustomEmbed(message.member);

      if (await isPremium(user.id)) {
        const [profile, aliases] = await Promise.all([
          getPremiumProfile(user.id),
          getUserAliases(user.id),
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
        rows[0].components[0].setDisabled(false);

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
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **5** to do this")],
          });
          return waitForButton();
        }

        if (await isPremium(user.id)) {
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

        await addMember(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-tier") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **5** to do this")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user.id))) {
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

        await setTier(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-expire") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **5** to do this")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user.id))) {
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

        await setExpireDate(user.id, date.toDate());
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "raw-data") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **1** to do this")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} raw premium data`,
        );
        const profile = await getPremiumProfile(user.id);
        await res.editReply({
          embeds: [
            new CustomEmbed(message.member, `\`\`\`${JSON.stringify(profile, null, 2)}\`\`\``),
          ],
        });
        return waitForButton();
      } else if (res.customId === "del-cmd") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **3** to do this")],
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
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **3** to do this")],
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
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **5** to do this")],
          });
          return waitForButton();
        }
        logger.info(
          `admin: ${message.author.id} (${message.author.username}) set ${user.id} expire to now`,
        );
        await expireUser(user.id, message.client as NypsiClient);
        await res.editReply({ embeds: [new CustomEmbed(message.member, "done sir.")] });
        return waitForButton();
      } else if (res.customId === "set-credits") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **5** to do this")],
          });
          return waitForButton();
        }

        if (!(await isPremium(user.id))) {
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

        await setCredits(user.id, parseInt(msg.content));
        msg.react("✅");
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
            .setEmoji("📋"),
          new ButtonBuilder()
            .setCustomId("ac-clear")
            .setLabel("clear")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🗑️"),
        ),

        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("captcha-hist")
            .setLabel("captcha history")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🤖"),
          new ButtonBuilder()
            .setCustomId("give-captcha")
            .setLabel("give captcha")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🤖"),
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
        if ((await getAdminLevel(message.author.id)) < 2) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **2** to do this")],
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
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **3** to do this")],
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
        if ((await getAdminLevel(res.user.id)) < 1) {
          res.followUp({ embeds: [new ErrorEmbed("you require admin level 1 for this")] });
          return;
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) gave ${user.id} captcha`,
        );

        await giveCaptcha(user.id, 2, true);

        res.followUp({ content: "✅" });
        return waitForButton();
      } else if (res.customId === "captcha-hist") {
        if ((await getAdminLevel(res.user.id)) < 1) {
          res.followUp({ embeds: [new ErrorEmbed("you require admin level 2 for this")] });
          return;
        }

        logger.info(
          `admin: ${message.author.id} (${message.author.username}) viewed ${user.id} captcha history`,
        );

        const history = await prisma.captcha.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });

        const embed = new CustomEmbed(message.member);

        const pages = PageManager.createPages(
          history.map(
            (captcha) =>
              "```\n" +
              `received at: ${dayjs(captcha.createdAt).format("YYYY-MM-DD HH:mm:ss")}\n` +
              `prompts: ${captcha.received}\n` +
              `visits: ${captcha.visits.map((i) => dayjs(i).format("HH:mm:ss")).join(" ")}\n` +
              `${captcha.solved ? `solved at: ${dayjs(captcha.solvedAt).format("HH:mm:ss")}` : "not solved"}` +
              "\n```",
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
          .setEmoji("👍🏻"),
        new ButtonBuilder()
          .setCustomId("remove-tag")
          .setLabel("remove tag")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👎🏻"),
      ),
    ];

    const embed = new CustomEmbed(message.member);

    let tags = await getTags(user.id);

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
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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

        tags = await addTag(user.id, msgResponse.content);

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
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({
            embeds: [new ErrorEmbed("you require admin level **4** to do this")],
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

        tags = await removeTag(user.id, msgResponse.content);

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

  const findId = async (tag: string) => {
    const findFromCache = async () => {
      let user: any = await (message.client as NypsiClient).cluster.broadcastEval(
        async (c, { userId }) => {
          const g = await c.users.cache.find((u) => {
            return `${u.username}`.includes(userId);
          });

          return g;
        },
        { context: { userId: tag } },
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
        lastKnownUsername: { contains: tag },
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

  const requestProfileTransfer = async (from: User, to: User, force = false) => {
    if ((await getAdminLevel(message.author.id)) !== 69)
      return message.channel.send({
        embeds: [new ErrorEmbed("lol xd xdxddxd ahahhaha YOURE GAY dont even TRY")],
      });

    if (await hasProfile(to.id))
      return message.channel.send({
        embeds: [new ErrorEmbed(`${to.username} has a nypsi profile, ask them to do /data delete`)],
      });

    if (!(await hasProfile(from.id)))
      return message.channel.send({
        embeds: [new ErrorEmbed(`${from.username} doesn't have a nypsi profile you fucking idiot`)],
      });

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

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "profile transfer initiated")],
    });
  };

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      "$x userid (id) - view/edit disc info and db info" +
        "\n$x findid (tag/username) - will attempt to find user id from cached users and database" +
        "\n$x transfer <from id> <to id> - start a profile transfer" +
        "\n$x drop - start a random drop" +
        "\n$x memberfind - debug member targetting" +
        "\n$x fixcrash - reinitialise crash",
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

    return findId(args.slice(1, args.length).join(" "));
  } else if (args[0].toLowerCase() === "transfer") {
    if (message.author.id !== Constants.TEKOH_ID) return;

    const fromId = args[1];
    const toId = args[2];

    const fromUser = await message.client.users.fetch(fromId).catch(() => {});
    const toUser = await message.client.users.fetch(toId).catch(() => {});

    if (!fromUser) return message.channel.send({ embeds: [new ErrorEmbed("invalid from user")] });
    if (!toUser) return message.channel.send({ embeds: [new ErrorEmbed("invalid to user")] });

    return requestProfileTransfer(fromUser, toUser);
  } else if (args[0].toLowerCase() === "drop") {
    if ((await getAdminLevel(message.author.id)) < 5) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you require admin level **5** to do this")],
      });
    }

    startRandomDrop(message.client as NypsiClient, message.channelId);
  } else if (args[0].toLowerCase() === "memberfind") {
    const search = args.slice(1);

    const results = await getMember(message.guild, search.join(" "), true);

    return message.channel.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `\`${results.map((i) => `${i.username} - ${i.score}`).join("`\n`")}\``,
        ),
      ],
    });
  } else if (args[0].toLowerCase() === "fixcrash") {
    if (message.author.id !== Constants.TEKOH_ID) return;
    await redis.del(Constants.redis.nypsi.CRASH_STATUS);
    await initCrashGame(message.client as NypsiClient);
  } else if (args[0].toLowerCase() === "kofi") {
    if (message.author.id !== Constants.TEKOH_ID) return;

    const old = await prisma.kofiPurchases.findMany();

    const newData: Prisma.PurchasesCreateManyInput[] = [];

    for (const i of old) {
      newData.push({
        cost: new Prisma.Decimal(
          Array.from(Constants.KOFI_PRODUCTS.values()).find((i) => i.name === i.name).cost,
        ),
        item: i.item,
        source: "kofi-old",
        email: i.email || (await getEmail(i.userId)) || "unknown email",
        userId: i.userId,
        createdAt: i.date,
      });
    }

    await prisma.purchases.createMany({
      data: newData,
    });
  } else if (args[0].toLowerCase() === "checkspend") {
    const userIds = await prisma.purchases.findMany({
      distinct: ["userId"],
      select: {
        userId: true,
      },
    });

    for (const userId of userIds) {
      const old = await prisma.user.findUnique({
        where: {
          id: userId.userId,
        },
        select: {
          totalSpend: true,
        },
      });

      const newSpend = await getTotalSpend(userId.userId);

      if (newSpend !== old.totalSpend) {
        logger.debug(
          `wrong total spend ${newSpend} - ${old.totalSpend}. diff: ${newSpend - old.totalSpend}`,
        );
      }
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration: string): number {
  duration.toLowerCase();

  if (duration.includes("d")) {
    if (!parseInt(duration.split("d")[0])) return undefined;

    const num = parseInt(duration.split("d")[0]);

    return num * 86400;
  } else if (duration.includes("h")) {
    if (!parseInt(duration.split("h")[0])) return undefined;

    const num = parseInt(duration.split("h")[0]);

    return num * 3600;
  } else if (duration.includes("m")) {
    if (!parseInt(duration.split("m")[0])) return undefined;

    const num = parseInt(duration.split("m")[0]);

    return num * 60;
  } else if (duration.includes("s")) {
    if (!parseInt(duration.split("s")[0])) return undefined;

    const num = parseInt(duration.split("s")[0]);

    return num;
  }
}
