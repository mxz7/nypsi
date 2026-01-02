import dayjs = require("dayjs");
import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../../utils/Constants";
import {
  gemBreak,
  getInventory,
  removeInventoryItem,
} from "../../utils/functions/economy/inventory";
import { addStat } from "../../utils/functions/economy/stats";
import { pluralize } from "../../utils/functions/string";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import pAll = require("p-all");

export default {
  name: "streaks",
  cron: "0 0 * * *",
  async run(log, manager) {
    if (await redis.exists("nypsi:streakpause")) {
      log("streaks paused");
      return;
    }

    const dailyStreak = await doDailyStreaks(manager);

    log(`${dailyStreak} daily streak notifications sent`);

    const voteStreak = await doVoteStreaks(manager);
    log(`${voteStreak} vote streak notifications sent`);
  },
} satisfies Job;

async function doDailyStreaks(manager: ClusterManager) {
  const limit = dayjs().subtract(1, "day").subtract(1, "hours").toDate();

  const users = await prisma.economy.findMany({
    where: {
      AND: [{ lastDaily: { lte: limit } }, { dailyStreak: { gt: 0 } }],
    },
    select: {
      userId: true,
      dailyStreak: true,
      user: {
        select: {
          DMSettings: {
            select: {
              other: true,
            },
          },
        },
      },
    },
  });

  const calendarSavedEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setTitle("your daily streak has been saved by a calendar!")
    .setDescription(
      "calendars in your inventory protect your streaks, make sure to do `/daily` to continue your streak",
    );

  const gemSavedEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setTitle("your daily streak was saved by your white gem!")
    .setDescription(
      "<:nypsi_gem_white:1046933670436552725> white gems have a chance to protect your streaks. make sure to do /daily to continue your streak",
    );

  const whiteGemBrokeEmbed = (amount: number) => {
    return new CustomEmbed()
      .setColor(Constants.EMBED_FAIL_COLOR)
      .setTitle("your white gem has shattered")
      .setDescription(
        `<:nypsi_gem_white:1046933670436552725> the power exerted by your white gem to save your streak has unfortunately caused it to shatter into ${amount} ${pluralize("piece", amount)}`,
      );
  };

  const resetEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setTitle("you have lost your daily streak!")
    .setDescription(
      "you have lost your daily streak by not doing `/daily`. calendars can be used to protect your daily streak from being reset",
    );

  const notifications: NotificationPayload[] = [];
  const promises: (() => Promise<any>)[] = [];

  for (const user of users) {
    promises.push(async () => {
      const inventory = await getInventory(user.userId);

      if (inventory.has("calendar")) {
        if (user.user.DMSettings?.other)
          notifications.push({ memberId: user.userId, payload: { embed: calendarSavedEmbed } });

        await removeInventoryItem(user.userId, "calendar", 1);
        await addStat(user.userId, "calendar");

        return;
      } else if ((await inventory.hasGem("white_gem")).any) {
        const gemSaveChance = Math.floor(Math.random() * 10);

        if (gemSaveChance < 5) {
          notifications.push({ memberId: user.userId, payload: { embed: gemSavedEmbed } });

          const res = await gemBreak(user.userId, 7, "white_gem", manager, true, false);

          if (res) {
            notifications.push({
              memberId: user.userId,
              payload: { embed: whiteGemBrokeEmbed(res.shards).setFooter({ text: res.footerMsg }) },
            });
          }

          return;
        }
      }

      if (user.user.DMSettings?.other && user.dailyStreak >= 7)
        notifications.push({ memberId: user.userId, payload: { embed: resetEmbed } });

      await prisma.economy.update({
        where: {
          userId: user.userId,
        },
        data: {
          dailyStreak: 0,
        },
      });
    });
  }

  await pAll(promises, { concurrency: 7 });
  notifications.forEach((notif) => addNotificationToQueue(notif));

  return notifications.length;
}

async function doVoteStreaks(manager: ClusterManager) {
  const limit = dayjs().subtract(1, "day").subtract(1, "hours").toDate();

  const users = await prisma.economy.findMany({
    where: {
      AND: [{ lastVote: { lte: limit } }, { voteStreak: { gt: 0 } }],
    },
    select: {
      userId: true,
      voteStreak: true,
      user: {
        select: {
          DMSettings: {
            select: {
              other: true,
              voteReminder: true,
            },
          },
        },
      },
    },
  });

  const gemSavedEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setTitle("your vote streak was saved by your white gem!")
    .setDescription(
      "<:nypsi_gem_white:1046933670436552725> white gems have a chance to protect your streak. make sure to vote to continue your streak",
    );

  const whiteGemBrokeEmbed = (amount: number) => {
    return new CustomEmbed()
      .setColor(Constants.EMBED_FAIL_COLOR)
      .setTitle("your white gem has shattered")
      .setDescription(
        `<:nypsi_gem_white:1046933670436552725> the power exerted by your white gem to save your streak has unfortunately caused it to shatter into ${amount} ${pluralize("piece", amount)}`,
      );
  };

  const resetEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setTitle("you have lost your vote streak!")
    .setDescription(
      "you have lost your vote streak by not doing voting in over a day.\nvote at least **once every 24 hours** to maintain your streak!",
    );

  const voteRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL("https://top.gg/bot/678711738845102087/vote")
      .setLabel("top.gg")
      .setEmoji("<:topgg:1355915569286610964>"),
  );

  const remindersRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL("https://top.gg/bot/678711738845102087/vote")
      .setLabel("top.gg"),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel("enable vote reminders")
      .setCustomId("enable-vote-reminders"),
  );

  const notifications: NotificationPayload[] = [];
  const promises: (() => Promise<any>)[] = [];

  for (const user of users) {
    promises.push(async () => {
      const inventory = await getInventory(user.userId);

      if ((await inventory.hasGem("white_gem")).any) {
        const gemSaveChance = Math.floor(Math.random() * 10);

        if (gemSaveChance < 5) {
          if (user.user.DMSettings?.other) {
            if (user.user.DMSettings.voteReminder) {
              notifications.push({
                memberId: user.userId,
                payload: { embed: gemSavedEmbed, components: voteRow },
              });
            } else {
              notifications.push({
                memberId: user.userId,
                payload: { embed: gemSavedEmbed, components: remindersRow },
              });
            }
          }

          const res = await gemBreak(user.userId, 7, "white_gem", manager, true, false);

          if (res) {
            if (user.user.DMSettings?.other) {
              if (user.user.DMSettings.voteReminder) {
                notifications.push({
                  memberId: user.userId,
                  payload: {
                    embed: whiteGemBrokeEmbed(res.shards).setFooter({ text: res.footerMsg }),
                    components: voteRow,
                  },
                });
              } else {
                notifications.push({
                  memberId: user.userId,
                  payload: {
                    embed: whiteGemBrokeEmbed(res.shards).setFooter({ text: res.footerMsg }),
                    components: remindersRow,
                  },
                });
              }
            }
          }

          return;
        }
      }

      if (user.user.DMSettings?.other && user.voteStreak >= 3) {
        if (user.user.DMSettings.voteReminder) {
          notifications.push({
            memberId: user.userId,
            payload: { embed: resetEmbed, components: voteRow },
          });
        } else {
          notifications.push({
            memberId: user.userId,
            payload: { embed: resetEmbed, components: remindersRow },
          });
        }
      }

      await prisma.economy.update({
        where: {
          userId: user.userId,
        },
        data: {
          voteStreak: 0,
        },
      });
    });
  }

  await pAll(promises, { concurrency: 7 });
  notifications.forEach((notif) => addNotificationToQueue(notif));

  return notifications.length;
}
