import dayjs = require("dayjs");
import ms = require("ms");
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { KarmaShopItem } from "../../../types/Karmashop";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";

declare function require(name: string): any;

async function createNextDate() {
  const nextOpen = new Date(
    Date.now() + (Math.floor(Math.random() * ms("10 days")) + ms("10 days")),
  );
  const adjusted = dayjs(nextOpen).set("minutes", 0);

  await redis.set(Constants.redis.nypsi.KARMA_NEXT_OPEN, adjusted.toDate().getTime());
}

export async function getNextKarmaShopOpen() {
  if (!(await redis.exists(Constants.redis.nypsi.KARMA_NEXT_OPEN))) await createNextDate();

  const ms = await redis.get(Constants.redis.nypsi.KARMA_NEXT_OPEN);

  return new Date(parseInt(ms));
}

export async function getLastKarmaShopOpen() {
  const ms = await redis.get(Constants.redis.nypsi.KARMA_LAST_OPEN);

  if (!ms) return new Date(0);
  return new Date(parseInt(ms));
}

export async function isKarmaShopOpen() {
  const v = await redis.get(Constants.redis.nypsi.KARMA_SHOP_OPEN);

  if (typeof v === "string" && v === "t") return true;
  return false;
}

export async function closeKarmaShop() {
  await redis.del(Constants.redis.nypsi.KARMA_SHOP_OPEN);
  restock();
}

async function restock() {
  const items = require("../../../../data/karmashop.json");

  for (const key of Object.keys(items as { [key: string]: KarmaShopItem })) {
    items[key].bought = [];
  }
  await redis.set(Constants.redis.nypsi.KARMA_SHOP_ITEMS, JSON.stringify(items));
}

export async function getKarmaShopItems() {
  return JSON.parse(await redis.get(Constants.redis.nypsi.KARMA_SHOP_ITEMS)) as {
    [key: string]: KarmaShopItem;
  };
}

export async function setKarmaShopItems(items: { [key: string]: KarmaShopItem }) {
  await redis.set(Constants.redis.nypsi.KARMA_SHOP_ITEMS, JSON.stringify(items));
}

export async function openKarmaShop(client: NypsiClient, now = false) {
  const open = async () => {
    if (!now && (await getNextKarmaShopOpen()).getTime() > Date.now()) return;
    restock();
    await createNextDate();
    await redis.set(Constants.redis.nypsi.KARMA_LAST_OPEN, Date.now());

    await redis.set(Constants.redis.nypsi.KARMA_SHOP_OPEN, "t");
    await redis.expire(Constants.redis.nypsi.KARMA_SHOP_OPEN, Math.floor(ms("1 hour") / 1000));

    logger.info("karma shop has been opened");

    const clusters = await client.cluster.broadcastEval(async (client) => {
      const guild = await client.guilds.cache.get("747056029795221513");

      if (guild) return (client as unknown as NypsiClient).cluster.id;
      return "not-found";
    });

    let cluster: number;

    for (const i of clusters) {
      if (i != "not-found") {
        cluster = i;
        break;
      }
    }

    await client.cluster
      .broadcastEval(
        async (client, { content, cluster }) => {
          if ((client as unknown as NypsiClient).cluster.id != cluster) return;
          const guild = await client.guilds.cache.get("747056029795221513");

          if (!guild) return;

          const channel = await guild.channels.cache.get("747057465245564939");

          if (!channel) return;

          if (channel.isTextBased()) {
            await channel.send({ content });
          }
        },
        {
          context: {
            content: `🔮 <@&1088800175532806187> karma shop has been opened!! it will next open at <t:${Math.floor(
              dayjs(await getNextKarmaShopOpen())
                .set("seconds", 0)
                .unix(),
            )}>`,
            cluster: cluster,
          },
        },
      )
      .then((res) => {
        return res.filter((i) => Boolean(i));
      });
  };

  const nextOpen = (await getNextKarmaShopOpen()).getTime();

  const needed = nextOpen - Date.now();

  if (client.user.id !== Constants.BOT_USER_ID) return;

  setTimeout(open, now ? 1000 : needed);
  if (!now) logger.info(`::auto karma shop will open in ${MStoTime(needed, true)}`);
}
