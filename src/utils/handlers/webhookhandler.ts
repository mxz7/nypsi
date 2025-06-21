import { Prisma } from "@prisma/client";
import { WebhookClient } from "discord.js";
import * as express from "express";
import { checkStatus } from "../..";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { KofiResponse } from "../../types/Kofi";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../Constants";
import { addProgress, setProgress } from "../functions/economy/achievements";
import { addInventoryItem, calcItemValue } from "../functions/economy/inventory";
import { getItems, loadItems, setEcoBan } from "../functions/economy/utils";
import {
  addMember,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setTier,
} from "../functions/premium/premium";
import { getTax, getTaxRefreshTime } from "../functions/tax";
import { createAuraTransaction } from "../functions/users/aura";
import {
  addNotificationToQueue,
  getDmSettings,
  getPreferences,
} from "../functions/users/notifications";
import { logger } from "../logger";

loadItems(false);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export function listen() {
  // app.post(
  //   "/topgg",
  //   webhook.listener((vote) => {
  //     logger.info(`received vote: ${vote.user}`);
  //     doVote(vote);
  //   }),
  // );

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

  app.post("/achievement/animal_lover/progress/:id", async (req, res) => {
    const auth = req.headers.authorization;

    if (auth !== process.env.API_AUTH) {
      res.status(401).send();
      return;
    }

    const { id } = req.params;
    const { progress } = req.body;
    await setProgress(id, "animal_lover", progress);
    res.status(200).send();
  });

  app.delete("/redis", express.text(), async (req, res) => {
    const auth = req.headers.authorization;

    if (auth !== process.env.API_AUTH) {
      res.status(401).send();
      return;
    }

    logger.info(`deleting redis keys (${req.body.split("\n").join(", ")})`);

    await redis.del(...req.body.split("\n"));

    res.status(200).send();
  });

  app.get("/item/value/:item", async (req, res) => {
    const { item } = req.params;

    const value = await calcItemValue(item);
    res.status(200).json({
      value,
    });
  });

  app.listen(process.env.EXPRESS_PORT || 5000);

  logger.info(`listening on port ${process.env.EXPRESS_PORT || 5000}`);
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

  if (user) {
    await redis.del(`${Constants.redis.cache.premium.TOTAL_SPEND}:${user.id}`);
  }

  if (data.type === "Donation") {
    if (user) {
      createAuraTransaction(user.id, Constants.BOT_USER_ID, 500);

      await prisma.purchases.create({
        data: {
          userId: user.id,
          item: "donation",
          cost: new Prisma.Decimal(data.amount),
          email: data.email,
          source: "kofi",
        },
      });
    } else {
      await prisma.purchases.create({
        data: {
          item: "donation",
          cost: new Prisma.Decimal(data.amount),
          email: data.email,
          source: "kofi",
        },
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

        await prisma.purchases.create({
          data: {
            userId: user.id,
            item: item.name,
            amount: shopItem.quantity,
            cost: new Prisma.Decimal(item.cost).mul(new Prisma.Decimal(shopItem.quantity)),
            email: data.email,
            source: "kofi",
          },
        });

        if (item.name === "unecoban") {
          await setEcoBan(user.id);
          logger.info(`unbanned ${user.id} (${user.email})`, item);

          if ((await getDmSettings(user.id)).premium) {
            const payload: NotificationPayload = {
              memberId: user.id,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed(user.id).setDescription(`you have been **unbanned**`),
              },
            };

            addNotificationToQueue(payload);
            if (data.is_public && (await getPreferences(user.id)).leaderboards) {
              const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
              await hook.send({
                embeds: [
                  new CustomEmbed(
                    user.id,
                    `${user.lastKnownUsername} just bought an **unban**!!!!`,
                  ).setFooter({ text: "thank you for your purchase (:" }),
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
                embed: new CustomEmbed(user.id).setDescription(
                  `you have received ${shopItem.quantity} ${getItems()[item.name].emoji} **${
                    getItems()[item.name].name
                  }**`,
                ),
              },
            };

            addNotificationToQueue(payload);
            if (data.is_public && (await getPreferences(user.id)).leaderboards) {
              const hook = new WebhookClient({ url: process.env.THANKYOU_HOOK });
              await hook.send({
                embeds: [
                  new CustomEmbed(
                    user.id,
                    `${user.lastKnownUsername} just bought ${shopItem.quantity}x ${
                      getItems()[item.name].emoji
                    } **${getItems()[item.name].name}**!!!!`,
                  ).setFooter({ text: "thank you for your purchase (:" }),
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
            addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed(user.id)
                  .setDescription(
                    `${
                      getItems()["pink_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        } else if (gemChance == 17) {
          await addInventoryItem(user.id, "blue_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed(user.id)
                  .setDescription(
                    `${
                      getItems()["blue_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        } else if (gemChance == 77) {
          await addInventoryItem(user.id, "purple_gem", 1);
          addProgress(user.id, "gem_hunter", 1);

          if ((await getDmSettings(user.id)).other) {
            addNotificationToQueue({
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
            addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed(user.id)
                  .setDescription(
                    `${
                      getItems()["green_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        } else if (gemChance == 57) {
          const gemChance2 = Math.floor(Math.random() * 50);

          if (gemChance2 == 7 && (await getDmSettings(user.id)).other) {
            await addInventoryItem(user.id, "white_gem", 1);
            addProgress(user.id, "gem_hunter", 1);

            addNotificationToQueue({
              memberId: user.id,
              payload: {
                embed: new CustomEmbed(user.id)
                  .setDescription(
                    `${
                      getItems()["white_gem"].emoji
                    } you've found a gem! i wonder what powers it holds...`,
                  )
                  .setTitle("you've found a gem"),
              },
            });
          }
        }
      } else {
        await prisma.purchases.create({
          data: {
            email: data.email,
            item: item.name,
            amount: shopItem.quantity,
            cost: new Prisma.Decimal(item.cost).mul(new Prisma.Decimal(shopItem.quantity)),
            source: "kofi",
          },
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

      await prisma.purchases.create({
        data: {
          userId: user.id,
          email: data.email,
          cost: new Prisma.Decimal(item.cost),
          item: item.name,
          source: "kofi",
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
                new CustomEmbed(
                  user.id,
                  `${user.lastKnownUsername} just bought **${item.name}**!!!!`,
                ).setFooter({
                  text: "thank you for your purchase (:",
                }),
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
              new CustomEmbed(
                user.id,
                `${user.lastKnownUsername} just bought **${item.name}**!!!!`,
              ).setFooter({
                text: "thank you for your purchase (:",
              }),
            ],
          });
          hook.destroy();
        }
      }
    } else {
      await prisma.purchases.create({
        data: {
          email: data.email,
          item: item.name,
          cost: new Prisma.Decimal(item.cost),
          source: "kofi",
        },
      });

      logger.info(`created purchase for ${data.email}`, item);
    }
  }
}
