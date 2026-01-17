import { Prisma } from "#generated/prisma";
import { WebhookClient } from "discord.js";
import { Hono } from "hono";
import { validator } from "hono/validator";
import z from "zod";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems, setEcoBan } from "../../utils/functions/economy/utils";
import {
  addMember,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setTier,
} from "../../utils/functions/premium/premium";
import { createAuraTransaction } from "../../utils/functions/users/aura";
import {
  addNotificationToQueue,
  getDmSettings,
  getPreferences,
} from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

const kofiController = new Hono();

const schema = z.object({
  type: z.string(),
  email: z.string(),
  tier_name: z.string().nullable().optional(),
  shop_items: z
    .array(z.object({ direct_link_code: z.string(), quantity: z.number() }))
    .nullable()
    .optional(),
  verification_token: z.string(),
  is_public: z.boolean(),
  amount: z.string(),
});

kofiController.post(
  "/",
  validator("form", (value, c) => {
    console.log(value);
    const parsed = schema.safeParse(JSON.parse(value["data"] as string));
    console.log(parsed);

    if (!parsed.success) {
      logger.error(`api: received faulty kofi data`, { value, parsed });
      return c.body(null, 400);
    }

    return parsed.data;
  }),
  (c) => {
    const data = c.req.valid("form");

    if (data.verification_token !== process.env.KOFI_VERIFICATION) {
      logger.error(`api: received faulty kofi data (verification)`, data);
      return c.body(null, 401);
    }

    handleKofiData(data);

    return c.body(null, 200);
  },
);

export default kofiController;

async function handleKofiData(data: z.infer<typeof schema>) {
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
