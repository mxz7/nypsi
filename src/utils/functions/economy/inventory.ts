import dayjs = require("dayjs");
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CommandCategory } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getTier, isPremium } from "../premium/premium";
import { percentChance } from "../random";
import sleep from "../sleep";
import { getTax } from "../tax";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addProgress } from "./achievements";
import { getAuctionAverage } from "./auctions";
import { addBalance, getSellMulti } from "./balance";
import { getOffersAverage } from "./offers";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

const gemChanceCooldown = new Set<string>();
setInterval(() => {
  gemChanceCooldown.clear();
}, 60000);

export async function getInventory(
  member: GuildMember | string,
): Promise<{ item: string; amount: number }[]> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.INVENTORY}:${id}`);

  if (cache) {
    try {
      return JSON.parse(cache) || [];
    } catch {
      return [];
    }
  }

  const query = await prisma.inventory
    .findMany({
      where: {
        userId: id,
      },
      select: {
        item: true,
        amount: true,
      },
    })
    .then((q) =>
      q.map((i) => {
        return { item: i.item, amount: Number(i.amount) };
      }),
    )
    .catch(() => {});

  if (!query || query.length == 0) {
    if (!(await userExists(id))) await createUser(id);
    await redis.set(`${Constants.redis.cache.economy.INVENTORY}:${id}`, "[]", "EX", 180);
    return [];
  }

  await redis.set(
    `${Constants.redis.cache.economy.INVENTORY}:${id}`,
    JSON.stringify(query),
    "EX",
    180,
  );

  return query;
}

async function doAutosellThing(userId: string, itemId: string, amount: number): Promise<void> {
  if (await redis.exists(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`)) {
    await sleep(100);
    return doAutosellThing(userId, itemId, amount);
  }

  await redis.set(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`, "t", "EX", 69);

  const item = getItems()[itemId];

  let sellWorth = Math.floor(item.sell * amount);

  const multi = (await getSellMulti(userId)).multi;

  if (item.role == "fish" || item.role == "prey" || item.role == "sellable") {
    sellWorth = Math.floor(sellWorth + sellWorth * multi);
  } else if (!item.sell) {
    sellWorth = 1000 * amount;
  }

  if (["bitcoin", "ethereum"].includes(item.id))
    sellWorth = Math.floor(sellWorth - sellWorth * 0.05);

  let tax = true;

  if ((await isPremium(userId)) && (await getTier(userId)) == 4) tax = false;

  if (tax) {
    const taxedAmount = Math.floor(sellWorth * (await getTax()));

    sellWorth = sellWorth - taxedAmount;
  }

  await addBalance(userId, sellWorth);

  addStat(userId, "earned-sold", sellWorth);

  await redis.hincrby(
    `${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${userId}`,
    `${itemId}-money`,
    sellWorth,
  );
  await redis.hincrby(
    `${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${userId}`,
    `${itemId}-amount`,
    amount,
  );

  if (!(await redis.lrange(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS, 0, -1)).includes(userId))
    await redis.lpush(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS, userId);

  await redis.del(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`);
  return;
}

export async function addInventoryItem(
  member: GuildMember | string,
  itemId: string,
  amount: number,
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (amount <= 0) return;

  if (!(await userExists(id))) await createUser(id);

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  if ((await getAutosellItems(id)).includes(itemId)) {
    return doAutosellThing(id, itemId, amount);
  }

  await prisma.inventory.upsert({
    where: {
      userId_item: {
        userId: id,
        item: itemId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      userId: id,
      item: itemId,
      amount: amount,
    },
  });

  await redis.del(
    `${Constants.redis.cache.economy.INVENTORY}:${id}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
  );
}

export async function removeInventoryItem(
  member: GuildMember | string,
  itemId: string,
  amount: number,
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (amount <= 0) return;

  if (!(await userExists(id))) await createUser(id);

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  await prisma.inventory.upsert({
    where: {
      userId_item: {
        userId: id,
        item: itemId,
      },
    },
    update: {
      amount: { decrement: amount },
    },
    create: {
      userId: id,
      item: itemId,
      amount: amount,
    },
  });

  await redis.del(
    `${Constants.redis.cache.economy.INVENTORY}:${id}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
  );
}

export async function setInventoryItem(
  member: GuildMember | string,
  itemId: string,
  amount: number,
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!getItems()[itemId]) {
    console.trace();
    return logger.error(`invalid item: ${itemId}`);
  }

  if (amount <= 0) {
    await prisma.inventory
      .delete({
        where: {
          userId_item: {
            userId: id,
            item: itemId,
          },
        },
      })
      .catch(() => {});
  } else {
    await prisma.inventory.upsert({
      where: {
        userId_item: {
          userId: id,
          item: itemId,
        },
      },
      update: {
        amount: amount,
      },
      create: {
        userId: id,
        item: itemId,
        amount: amount,
      },
    });
  }

  await redis.del(
    `${Constants.redis.cache.economy.INVENTORY}:${id}`,
    `${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`,
  );
}

export async function getTotalAmountOfItem(itemId: string) {
  if (itemId === "lottery_ticket") return 0;

  const query = await prisma.inventory.aggregate({
    where: {
      item: itemId,
    },
    _sum: {
      amount: true,
    },
  });

  const auctions = await prisma.auction.aggregate({
    where: {
      AND: [{ sold: false }, { itemId }],
    },
    _sum: {
      itemAmount: true,
    },
  });

  return Number(query._sum.amount) + Number(auctions._sum.itemAmount);
}

export function selectItem(search: string) {
  search = search.toLowerCase();
  const items = getItems();

  for (const item of Array.from(Object.values(items))) {
    const aliases = item.aliases || [];
    if (search === item.id) {
      return item;
    } else if (search === item.name) {
      return item;
    } else if (search === item.id.split("_").join("")) {
      return item;
    } else if (aliases.indexOf(search) != -1) {
      return item;
    } else if (search === item.name.split(" ").join("")) {
      return item;
    } else if (search === item.plural) {
      return item;
    }
  }

  return undefined;
}

export async function commandGemCheck(member: GuildMember, commandCategory: CommandCategory) {
  if (await redis.exists(Constants.redis.nypsi.GEM_GIVEN)) return;
  if (!(await userExists(member))) return;
  if (!(await getDmSettings(member)).other) return;
  if (gemChanceCooldown.has(member.user.id)) return;
  gemChanceCooldown.add(member.user.id);

  if (percentChance(0.001)) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
    const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

    const gem = gems[Math.floor(Math.random() * gems.length)];

    logger.info(`${member.user.id} received ${gem} randomly`);

    await addInventoryItem(member, gem, 1);
    addProgress(member.user.id, "gem_hunter", 1);

    if ((await getDmSettings(member)).other) {
      addNotificationToQueue({
        memberId: member.user.id,
        payload: {
          embed: new CustomEmbed(
            member,
            `${getItems()[gem].emoji} you've found a gem! i wonder what powers it holds...`,
          ).setTitle("you've found a gem"),
        },
      });
    }
  }

  if (commandCategory == "moderation") {
    if (percentChance(0.07)) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      logger.info(`${member.user.id} received pink_gem randomly`);
      await addInventoryItem(member, "pink_gem", 1);
      addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["pink_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  } else if (commandCategory == "animals") {
    if (percentChance(0.007)) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      logger.info(`${member.user.id} received purple_gem randomly`);
      await addInventoryItem(member, "purple_gem", 1);
      addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["purple_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  }
}

export function isGem(itemId: string) {
  return itemId.includes("_gem") || itemId === "crystal_heart";
}

export async function gemBreak(userId: string, chance: number, gem: string) {
  if (!percentChance(chance)) return;

  const inventory = await getInventory(userId);

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) return;
  if (!inventory.find((i) => i.item === gem) || inventory.find((i) => i.item === gem).amount < 1)
    return;

  let uniqueGemCount = 0;

  inventory.forEach((i) => {
    if (i.item.includes("_gem")) uniqueGemCount++;
  });

  if (uniqueGemCount === 5 && percentChance(50) && (await getDmSettings(userId)).other) {
    await Promise.all([
      removeInventoryItem(userId, "pink_gem", 1),
      removeInventoryItem(userId, "purple_gem", 1),
      removeInventoryItem(userId, "blue_gem", 1),
      removeInventoryItem(userId, "green_gem", 1),
      removeInventoryItem(userId, "white_gem", 1),
      prisma.crafting.create({
        data: {
          amount: 1,
          finished: dayjs().add(7, "days").toDate(),
          itemId: "crystal_heart",
          userId,
        },
      }),
    ]);

    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(userId)
          .setTitle("a very exciting moment")
          .setFooter({ text: "use /craft to view the progress" })
          .setDescription(
            `${
              getItems()["crystal_heart"].emoji
            } a truly historic event is taking place\nyour gems are fusing together, into one crystal\n\n` +
              `${getItems()["white_gem"].emoji} ${getItems()["pink_gem"].emoji} ${
                getItems()["purple_gem"].emoji
              } ${getItems()["blue_gem"].emoji} ${getItems()["green_gem"].emoji}`,
          ),
      },
    });
    return;
  }

  await removeInventoryItem(userId, gem, 1);

  const shardMax = new Map<string, number>([
    ["green_gem", 3],
    ["blue_gem", 3],
    ["purple_gem", 10],
    ["pink_gem", 15],
    ["white_gem", 30],
  ]);

  const amount = Math.floor(Math.random() * shardMax.get(gem) - 1) + 1;

  await addInventoryItem(userId, "gem_shard", amount);

  if ((await getDmSettings(userId)).other) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(userId)
          .setTitle(`your ${getItems()[gem].name} has shattered`)
          .setDescription(
            `${
              getItems()[gem].emoji
            } your gem exerted too much power and destroyed itself. shattering into ${amount} piece${
              amount != 1 ? "s" : ""
            }`,
          ),
      },
    });
  }
}

export async function setAutosellItems(member: GuildMember, items: string[]) {
  const query = await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        autosell: items,
      },
      select: {
        autosell: true,
      },
    })
    .then((q) => q.autosell);

  await redis.del(`${Constants.redis.cache.economy.AUTO_SELL}:${member.user.id}`);

  return query;
}

export async function getAutosellItems(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.AUTO_SELL}:${id}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.AUTO_SELL}:${id}`),
    ) as string[];
  }

  const query = await prisma.economy
    .findUnique({
      where: {
        userId: id,
      },
      select: {
        autosell: true,
      },
    })
    .then((q) => q.autosell);

  await redis.set(
    `${Constants.redis.cache.economy.AUTO_SELL}:${id}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

export async function setSellFilter(member: GuildMember, items: string[]) {
  const query = await prisma.economy
    .update({
      where: {
        userId: member.user.id,
      },
      data: {
        sellallFilter: items,
      },
      select: {
        sellallFilter: true,
      },
    })
    .then((q) => q.sellallFilter);

  await redis.del(`${Constants.redis.cache.economy.SELL_FILTER}:${member.user.id}`);

  return query;
}

export async function getSellFilter(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.SELL_FILTER}:${id}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.SELL_FILTER}:${id}`),
    ) as string[];
  }

  const query = await prisma.economy
    .findUnique({
      where: {
        userId: id,
      },
      select: {
        sellallFilter: true,
      },
    })
    .then((q) => q.sellallFilter);

  await redis.set(
    `${Constants.redis.cache.economy.SELL_FILTER}:${id}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

export async function calcItemValue(item: string) {
  let itemValue = 1000;

  if (
    getItems()[item].buy ||
    item === "cookie" ||
    item === "bitcoin" ||
    item === "ethereum" ||
    ["prey", "fish", "sellable", "ore"].includes(getItems()[item].role)
  ) {
    itemValue = getItems()[item].sell || 1000;
  } else {
    const [auctionAvg, offersAvg] = await Promise.all([
      getAuctionAverage(item),
      getOffersAverage(item),
    ]);

    if (!offersAvg && auctionAvg) return auctionAvg;
    if (!auctionAvg && offersAvg) return offersAvg;
    if (!auctionAvg && !offersAvg) return undefined;

    itemValue = Math.floor(
      [offersAvg, auctionAvg, auctionAvg, auctionAvg].reduce((a, b) => a + b) / 4,
    );
  }

  (async () => {
    if (await redis.exists(`nypsi:item:value:store:cache:delay:thing:${item}`)) return;
    await redis.set(
      `nypsi:item:value:store:cache:delay:thing:${item}`,
      "69",
      "EX",
      3600 * Math.floor(Math.random() * 6) + 7,
    );

    const date = dayjs()
      .set("hours", 0)
      .set("minutes", 0)
      .set("seconds", 0)
      .set("milliseconds", 0)
      .toDate();

    const itemCheck = await prisma.graphMetrics.findFirst({
      where: {
        AND: [{ date }, { category: `item-value-${item}` }, { userId: "global" }],
      },
    });

    if (itemCheck) return;

    await prisma.graphMetrics.create({
      data: {
        date,
        category: `item-value-${item}`,
        userId: "global",
        value: itemValue,
      },
    });
  })();

  return itemValue;
}

export async function itemExists(itemId: string) {
  const cache = await redis.get(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`);

  if (cache === "t") return true;
  else if (cache === "f") return false;

  const inventory = await prisma.inventory.findFirst({
    where: {
      item: itemId,
    },
  });

  if (inventory) {
    await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "t");
    return true;
  }

  const auction = await prisma.auction.findFirst({
    where: {
      sold: false,
      itemId: itemId,
    },
  });

  if (auction) {
    await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "t");
    return true;
  }

  await redis.set(`${Constants.redis.cache.economy.ITEM_EXISTS}:${itemId}`, "f");
  return false;
}
