import * as topgg from "@top-gg/sdk";
import { ClusterManager } from "discord-hybrid-sharding";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
  WebhookClient,
} from "discord.js";
import * as express from "express";
import { checkStatus } from "../..";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { KofiResponse } from "../../types/Kofi";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../Constants";
import { addProgress } from "../functions/economy/achievements";
import { addBalance } from "../functions/economy/balance";
import { addBooster } from "../functions/economy/boosters";
import { addInventoryItem } from "../functions/economy/inventory";
import { getRawLevel } from "../functions/economy/levelling";
import { addStat } from "../functions/economy/stats";
import {
  getItems,
  isEcoBanned,
  loadItems,
  setEcoBan,
  userExists,
} from "../functions/economy/utils";
import { addXp } from "../functions/economy/xp";
import { addKarma } from "../functions/karma/karma";
import {
  addMember,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setTier,
} from "../functions/premium/premium";
import { percentChance } from "../functions/random";
import requestDM from "../functions/requestdm";
import { getTax, getTaxRefreshTime } from "../functions/tax";
import { createAuraTransaction } from "../functions/users/aura";
import { isUserBlacklisted } from "../functions/users/blacklist";
import {
  addNotificationToQueue,
  getDmSettings,
  getPreferences,
} from "../functions/users/notifications";
import { logger } from "../logger";
import ms = require("ms");

loadItems(false);

const app = express();
const webhook = new topgg.Webhook(process.env.TOPGG_AUTH);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export function listen(manager: ClusterManager) {
  app.post(
    "/topgg",
    webhook.listener((vote) => {
      logger.info(`received vote: ${vote.user}`);
      doVote(vote, manager);
    }),
  );

  app.post("/kofi", async (req, response) => {
    const data = JSON.parse(req.body.data) as KofiResponse;

    logger.info("received kofi data", data);

    if (data.verification_token != process.env.KOFI_VERIFICATION) {
      logger.error("received faulty kofi data", data);
      return;
    }

    response.status(200).send();

    return handleKofiData(data);
  });

  app.get("/status", async (req, res) => {
    res.set("cache-control", "max-age=60");

    const response = await checkStatus();

    res.json(response);
  });

  app.get("/tax", async (req, res) => {
    res.set("cache-control", "max-age=60");

    const [tax, refreshTime] = await Promise.all([getTax(), getTaxRefreshTime()]);

    res.json({
      tax,
      refreshTime,
    });
  });

  app.listen(process.env.EXPRESS_PORT || 5000);

  logger.info(`listening on port ${process.env.EXPRESS_PORT || 5000}`);
}

async function doVote(vote: topgg.WebhookPayload, manager: ClusterManager) {
  const { user } = vote;

  await redis.srem(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, user);

  if (!(await userExists(user))) {
    logger.warn(`${user} doesnt exist`);
    return;
  }

  if (await isUserBlacklisted(user)) {
    logger.info(`${user} blacklisted`);
    return;
  }

  const now = new Date().getTime();

  const query = await prisma.economy.findUnique({
    where: {
      userId: user,
    },
    select: {
      lastVote: true,
    },
  });

  const lastVote = query.lastVote.getTime();

  if (now - lastVote < 25200000) {
    return logger.error(`${user} already voted`);
  }

  const votes = await prisma.economy.update({
    where: {
      userId: user,
    },
    data: {
      lastVote: new Date(now),
      monthVote: { increment: 1 },
      seasonVote: { increment: 1 },
    },
    select: {
      monthVote: true,
      seasonVote: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.VOTE}:${user}`, "true");
  await redis.expire(`${Constants.redis.cache.economy.VOTE}:${user}`, ms("1 hour") / 1000);

  let level = await getRawLevel(user);

  if (level > 75) level = 75;

  const amount = Math.floor(15000 * (level / 13 + 1));

  let xp = 15;

  xp += Math.floor((await getRawLevel(user)) * 0.3);

  if (xp > 50) xp = 50;

  if (!(await isEcoBanned(user)).banned) {
    try {
      await Promise.all([
        addBalance(user, amount),
        addKarma(user, 10),
        addXp(user, xp),
        addBooster(user, "vote_booster"),
        redis.del(`${Constants.redis.cache.economy.VOTE}:${user}`),
        redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${user}`),
        addStat(user, "earned-vote", amount),
      ]).catch((e) => {
        logger.error("vote error", e);
      });
    } catch (e) {
      logger.error("vote error", e);
    }
  }

  await addInventoryItem(user, "lottery_ticket", 1);

  let crateAmount = 0;
  let rawLevel = await getRawLevel(user);

  while (crateAmount === 0 && rawLevel > -1) {
    if (Constants.PROGRESSION.VOTE_CRATE.has(rawLevel)) {
      crateAmount = Constants.PROGRESSION.VOTE_CRATE.get(rawLevel);
    } else rawLevel--;
  }

  await addInventoryItem(user, "vote_crate", crateAmount);
  createAuraTransaction(user, Constants.BOT_USER_ID, 50);

  if (percentChance(0.05) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
    await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
    await addInventoryItem(user, "blue_gem", 1);
    addProgress(user, "gem_hunter", 1);

    if ((await getDmSettings(user)).other) {
      await addNotificationToQueue({
        memberId: user,
        payload: {
          embed: new CustomEmbed()
            .setDescription(
              `${
                getItems()["blue_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            )
            .setTitle("you've found a gem")
            .setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      });
    }
  }

  logger.info(`::success vote processed for ${user}`);

  const embed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setDescription(
      "you have received the following: \n\n" +
        `+ $**${amount.toLocaleString()}**\n` +
        "+ **3**% multiplier\n" +
        `+ **${crateAmount}** vote crate${crateAmount != 1 ? "s" : ""}` +
        "\n+ **1** lottery ticket\n\n" +
        `you have voted **${votes.monthVote}** time${votes.monthVote > 1 ? "s" : ""} this month`,
    )
    .setFooter({ text: `+${xp}xp` });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("open crates")
      .setCustomId("vote-crates")
      .setStyle(ButtonStyle.Success),
  );

  if (!(await getDmSettings(user)).voteReminder) {
    const chance = Math.floor(Math.random() * 10);

    if (chance == 7) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel("enable vote reminders")
          .setCustomId("enable-vote-reminders")
          .setStyle(ButtonStyle.Secondary),
      );
    }
  }

  const res = await requestDM({
    memberId: user,
    client: manager,
    content: "thank you for voting!",
    embed: embed,
    components: row,
  });

  if (!res) {
    logger.warn(`failed to send vote confirmation to ${user}`);
  }
}

async function handleKofiData(data: KofiResponse) {
  const user = await prisma.user.findFirst({
    where: {
      AND: [{ email: data.email }, { blacklisted: false }],
    },
  });

  logger.info(
    `received kofi purchase for email: ${data.email} item ${
      data.tier_name || JSON.stringify(data.shop_items)
    }`,
  );

  if (data.type === "Donation") {
    if (user) {
      createAuraTransaction(user.id, Constants.BOT_USER_ID, 500);
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          totalSpend: { increment: parseFloat(data.amount) },
        },
      });

      await prisma.kofiPurchases.create({ data: { item: "donation", userId: user.id } });
    } else {
      await prisma.kofiPurchases.create({
        data: { item: `donation-${data.amount}`, email: data.email },
      });
    }

    return;
  }

  if (data.shop_items && data.shop_items.length > 0) {
    for (const shopItem of data.shop_items) {
      const item = Constants.KOFI_PRODUCTS.get(shopItem.direct_link_code);

      if (!item) {
        return logger.error(`invalid item: ${shopItem.direct_link_code}`, data);
      }

      if (!shopItem.quantity) {
        logger.error(`invalid quantity: ${JSON.stringify(shopItem)}`);
        return;
      }

      if (user) {
        createAuraTransaction(user.id, Constants.BOT_USER_ID, 500);
        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            totalSpend: { increment: parseFloat((item.cost * shopItem.quantity).toString()) },
          },
        });

        await prisma.kofiPurchases.createMany({
          data: new Array(shopItem.quantity).fill({
            userId: user.id,
            item: item.name,
          }),
        });

        if (item.name === "unecoban") {
          await setEcoBan(user.id);
          logger.info(`unbanned ${user.id} (${user.email})`, item);

          if ((await getDmSettings(user.id)).premium) {
            const payload: NotificationPayload = {
              memberId: user.id,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed()
                  .setDescription(`you have been **unbanned**`)
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            };

            await addNotificationToQueue(payload);
            if (data.is_public && (await getPreferences(user.id)).leaderboards) {
              const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
              await hook.send({
                embeds: [
                  new CustomEmbed(null, `${user.lastKnownUsername} just bought an **unban**!!!!`)
                    .setFooter({ text: "thank you for your purchase (:" })
                    .setColor(Constants.PURPLE),
                ],
              });
              hook.destroy();
            }
          }
        } else {
          await addInventoryItem(user.id, item.name, shopItem.quantity || 1);

          logger.info(`given to ${user.id} (${user.email})`, item);

          if ((await getDmSettings(user.id)).premium) {
            const payload: NotificationPayload = {
              memberId: user.id,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed()
                  .setDescription(
                    `you have received ${shopItem.quantity} ${getItems()[item.name].emoji} **${
                      getItems()[item.name].name
                    }**`,
                  )
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            };

            await addNotificationToQueue(payload);
            if (data.is_public && (await getPreferences(user.id)).leaderboards) {
              const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
              await hook.send({
                embeds: [
                  new CustomEmbed(
                    null,
                    `${user.lastKnownUsername} just bought ${shopItem.quantity}x ${
                      getItems()[item.name].emoji
                    } **${getItems()[item.name].name}**!!!!`,
                  )
                    .setFooter({ text: "thank you for your purchase (:" })
                    .setColor(Constants.PURPLE),
                ],
              });
              hook.destroy();
            }
          }
        }

        const gemChance = Math.floor(Math.random() * 100);

        if (gemChance == 7) {
          await addInventoryItem(user.id, "pink_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            await addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed()
                  .setDescription(
                    `${
                      getItems()["pink_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem")
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            });
          }
        } else if (gemChance == 17) {
          await addInventoryItem(user.id, "blue_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            await addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed()
                  .setDescription(
                    `${
                      getItems()["blue_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem")
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            });
          }
        } else if (gemChance == 77) {
          await addInventoryItem(user.id, "purple_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            await addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed()
                  .setDescription(
                    `${
                      getItems()["purple_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        } else if (gemChance == 27) {
          await addInventoryItem(user.id, "green_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            await addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed()
                  .setDescription(
                    `${
                      getItems()["green_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem")
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            });
          }
        } else if (gemChance == 57) {
          const gemChance2 = Math.floor(Math.random() * 50);

          if (gemChance2 == 7 && (await getDmSettings(user.id)).other) {
            await addInventoryItem(user.id, "white_gem", 1);
            addProgress(user.id, "gem_hunter", 1);

            await addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed()
                  .setDescription(
                    `${
                      getItems()["white_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem")
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            });
          }
        }
      } else {
        await prisma.kofiPurchases.createMany({
          data: new Array(shopItem.quantity).fill({
            email: data.email,
            item: item.name,
          }),
        });

        logger.info(`created purchase for ${data.email}`, item);
      }
    }
  }

  if (data.tier_name) {
    const item = Constants.KOFI_PRODUCTS.get(data.tier_name.toLowerCase());

    if (!item) {
      logger.error(`invalid tier: ${data.tier_name}`, data);
      console.log(data);
      return;
    }

    const premiums = ["platinum", "gold", "silver", "bronze"].reverse();

    if (!premiums.includes(item.name)) {
      logger.error("invalid premium", data);
      return;
    }

    if (user) {
      createAuraTransaction(user.id, Constants.BOT_USER_ID, 500);
      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: { totalSpend: { increment: parseFloat(item.cost.toString()) } },
      });

      await prisma.kofiPurchases.create({
        data: {
          userId: user.id,
          item: item.name,
        },
      });

      if (await isPremium(user.id)) {
        if (levelString(await getTier(user.id)).toLowerCase() != item.name) {
          await setTier(user.id, premiums.indexOf(item.name) + 1);
          await setCredits(user.id, 0);
          await renewUser(user.id);
          if (data.is_public && (await getPreferences(user.id)).leaderboards) {
            const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
            await hook.send({
              embeds: [
                new CustomEmbed(null, `${user.lastKnownUsername} just bought **${item.name}**!!!!`)
                  .setFooter({
                    text: "thank you for your purchase (:",
                  })
                  .setColor(Constants.PURPLE),
              ],
            });
            hook.destroy();
          }
        } else {
          await renewUser(user.id);
        }
      } else {
        await addMember(user.id, premiums.indexOf(item.name) + 1);
        if (data.is_public && (await getPreferences(user.id)).leaderboards) {
          const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
          await hook.send({
            embeds: [
              new CustomEmbed(null, `${user.lastKnownUsername} just bought **${item.name}**!!!!`)
                .setFooter({
                  text: "thank you for your purchase (:",
                })
                .setColor(Constants.PURPLE),
            ],
          });
          hook.destroy();
        }
      }
    } else {
      await prisma.kofiPurchases.create({
        data: {
          email: data.email,
          item: item.name,
        },
      });
      logger.info(`created purchase for ${data.email}`, item);
    }
  }
}
