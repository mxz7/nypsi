import * as topgg from "@top-gg/sdk";
import { Manager } from "discord-hybrid-sharding";
import * as express from "express";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { KofiResponse } from "../../types/Kofi";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../Constants";
import { getBalance, updateBalance } from "../functions/economy/balance";
import { addInventoryItem } from "../functions/economy/inventory";
import { getPrestige } from "../functions/economy/prestige";
import { addTicket, getTickets, userExists } from "../functions/economy/utils";
import { addKarma, getKarma } from "../functions/karma/karma";
import { addMember, getPremiumProfile, getTier, isPremium, renewUser, setTier } from "../functions/premium/premium";
import requestDM from "../functions/requestdm";
import { addNotificationToQueue, getDmSettings } from "../functions/users/notifications";
import { logger } from "../logger";
import ms = require("ms");
import dayjs = require("dayjs");

const app = express();
const webhook = new topgg.Webhook("123");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export function listen(manager: Manager) {
  app.post(
    "/dblwebhook",
    webhook.listener((vote) => {
      logger.info(`received vote: ${vote.user}`);
      doVote(vote, manager);
    })
  );

  app.post("/kofi", async (req, response) => {
    console.log(req.body);
    console.log(JSON.parse(req.body.data));

    const data = JSON.parse(req.body.data) as KofiResponse;

    console.log(data);

    if (data.verification_token != process.env.KOFI_VERIFICATION) {
      logger.error("received faulty kofi data");
      return logger.error(data);
    }

    response.status(200).send();

    return handleKofiData(data);
  });

  app.listen(process.env.EXPRESS_PORT || 5000);

  logger.info(`listening on port ${process.env.EXPRESS_PORT || 5000}`);
}

async function doVote(vote: topgg.WebhookPayload, manager: Manager) {
  const { user } = vote;

  await redis.srem("nypsi:vote_reminder:received", user);

  if (!(await userExists(user))) {
    logger.warn(`${user} doesnt exist`);
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

  await prisma.economy.update({
    where: {
      userId: user,
    },
    data: {
      lastVote: new Date(now),
    },
  });

  redis.set(`cache:vote:${user}`, "true");
  redis.expire(`cache:vote:${user}`, ms("1 hour") / 1000);

  let prestige = await getPrestige(user);

  if (prestige > 15) prestige = 15;

  const amount = Math.floor(15000 * (prestige / 2 + 1));

  await Promise.all([
    updateBalance(user, (await getBalance(user)) + amount),
    addKarma(user, 10),
    prisma.booster.create({
      data: {
        boosterId: "vote_booster",
        userId: user,
        expire: dayjs().add(2, "hour").toDate(),
      },
    }),
    redis.del(`cache:vote:${user}`),
    redis.del(`cache:economy:boosters:${user}`),
  ]);

  const tickets = await getTickets(user);

  const prestigeBonus = Math.floor(((await getPrestige(user)) > 20 ? 20 : await getPrestige(user)) / 2.5);
  const premiumBonus = Math.floor((await isPremium(user)) ? await getTier(user) : 0);
  const karmaBonus = Math.floor((await getKarma(user)) / 100);

  let max = 15 + (prestigeBonus + premiumBonus + karmaBonus) * 4;

  if (max > 50) max = 50;

  if (tickets.length <= max - 5) {
    await Promise.all([addTicket(user), addTicket(user), addTicket(user), addTicket(user), addTicket(user)]);
  }

  let crateAmount = Math.floor(prestige / 1.5 + 1);

  if (crateAmount > 5) crateAmount = 5;

  await addInventoryItem(user, "vote_crate", crateAmount, false);

  if ((await getDmSettings(user)).vote) {
    const embed = new CustomEmbed()
      .setColor("#5efb8f")
      .setDescription(
        "you have received the following: \n\n" +
          `+ $**${amount.toLocaleString()}**\n` +
          "+ **7**% multiplier\n" +
          `+ **${crateAmount}** vote crates` +
          `${tickets.length <= max - 5 ? "\n+ **5** lottery tickets" : ""}`
      )
      .disableFooter();

    if (!(await getDmSettings(user)).vote_reminder) {
      const chance = Math.floor(Math.random() * 10);

      if (chance == 7) {
        embed.setFooter({ text: "you can enable vote reminders with /settings me notifications" });
      }
    }

    const res = await requestDM({
      memberId: user,
      client: manager,
      content: "thank you for voting!",
      embed: embed,
    });

    if (res) {
      logger.log({
        level: "success",
        message: `vote processed for ${user}`,
      });
    } else {
      logger.warn(`failed to send vote confirmation to ${user}`);
    }
  }
}

async function handleKofiData(data: KofiResponse) {
  const user = await prisma.user.findUnique({
    where: {
      email: data.email,
    },
  });

  logger.info(`received kofi purchase for email: ${data.email} item ${data.tier_name || JSON.stringify(data.shop_items)}`);

  if (data.type.toLowerCase() == "shop order") {
    for (const shopItem of data.shop_items) {
      const item = Constants.KOFI_PRODUCTS.get(shopItem.direct_link_code);

      if (!item) {
        logger.error(`invalid item: ${shopItem.direct_link_code}`);
        return logger.error(data);
      }

      if (user) {
        await addInventoryItem(user.id, item, 1, false);

        logger.info(`${item} given to ${user.id} (${user.email})`);

        if ((await getDmSettings(user.id)).premium) {
          const payload: NotificationPayload = {
            memberId: user.id,
            payload: {
              content: "thank you for your purchase",
              embed: new CustomEmbed()
                .setDescription(`you have received 1 ${item}`)
                .setColor(Constants.TRANSPARENT_EMBED_COLOR),
            },
          };

          await addNotificationToQueue(payload);
        }
      } else {
        await prisma.kofiPurchases.create({
          data: {
            email: data.email,
            item: item,
          },
        });

        logger.info(`created purchase for ${data.email} ${item}`);
      }
    }
  } else if (data.type.toLowerCase() == "subscription") {
    const item = Constants.KOFI_PRODUCTS.get(data.tier_name.toLowerCase());

    if (!item) {
      logger.error("invalid item");
      return logger.error(data);
    }

    const premiums = ["platinum", "gold", "silver", "bronze"].reverse();

    if (!premiums.includes(item)) {
      logger.error("invalid premium");
      return logger.error(data);
    }

    if (user) {
      if (await isPremium(user.id)) {
        if ((await getPremiumProfile(user.id)).getLevelString().toLowerCase() != item) {
          await setTier(user.id, premiums.indexOf(item) + 1);
          await renewUser(user.id);
        } else {
          await renewUser(user.id);
        }
      } else {
        await addMember(user.id, premiums.indexOf(item) + 1);
      }
    } else {
      await prisma.kofiPurchases.create({
        data: {
          email: data.email,
          item: item,
        },
      });
      logger.info(`created purchase for ${data.email} ${item}`);
    }
  }
}
