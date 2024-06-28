import dayjs = require("dayjs");
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CommandCategory } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
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
import { addToGuildXP, getGuildName } from "./guilds";
import { getOffersAverage } from "./offers";
import { addStat } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import { addXp } from "./xp";
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
    await redis.set(`${Constants.redis.cache.economy.INVENTORY}:${id}`, "[]");
    await redis.expire(`${Constants.redis.cache.economy.INVENTORY}:${id}`, 180);
    return [];
  }

  await redis.set(`${Constants.redis.cache.economy.INVENTORY}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.economy.INVENTORY}:${id}`, 180);

  return query;
}

async function doAutosellThing(userId: string, itemId: string, amount: number): Promise<void> {
  if (await redis.exists(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`)) {
    await sleep(100);
    return doAutosellThing(userId, itemId, amount);
  }

  await redis.set(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`, "t");
  await redis.expire(`${Constants.redis.nypsi.AUTO_SELL_PROCESS}:${userId}`, 69);

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

  await redis.del(`${Constants.redis.cache.economy.INVENTORY}:${id}`);
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

  await redis.del(`${Constants.redis.cache.economy.INVENTORY}:${id}`);
}

export async function openCrate(
  member: GuildMember | string,
  item: Item,
): Promise<Map<string, number>> {
  const inventory = await getInventory(member);
  const items = getItems();

  if (
    !inventory.find((i) => i.item === item.id) ||
    inventory.find((i) => i.item === item.id).amount < 1
  ) {
    return new Map();
  }

  await setInventoryItem(member, item.id, inventory.find((i) => i.item == item.id).amount - 1);

  const crateItems: string[] = [];
  let mode: "normal" | "percent-based" = "normal";

  if (item.items) {
    for (const itemFilter of item.items) {
      let filteredItems: string[] = [];
      if (itemFilter.startsWith("id:")) {
        if (itemFilter.split(":")[2]) {
          mode = "percent-based";
          break;
        } else {
          filteredItems = Object.keys(items).filter((i) => i === itemFilter.substring(3));
        }
      } else if (itemFilter.startsWith("role:")) {
        filteredItems = Object.keys(items).filter((i) => items[i].role === itemFilter.substring(5));
      } else {
        crateItems.push(itemFilter);
        continue;
      }

      crateItems.push(...filteredItems);
    }
  } else {
    crateItems.push(
      ...["money:50000", "money:100000", "money:500000", "xp:50", "xp:100", "xp:250"],
    );

    for (const i of Object.keys(items)) {
      if (!items[i].in_crates) continue;
      crateItems.push(i);
    }
  }

  const times = item.crate_runs || 1;
  const found = new Map<string, number>();

  if (item.id.includes("69420")) {
    await addBalance(member, 69420);
    addStat(member, "earned-crates", 69420);
    found.set("money", 69420);
  }

  if (mode === "normal") {
    for (let i = 0; i < times; i++) {
      const crateItemsModified = [];

      for (const i of crateItems) {
        if (items[i]) {
          if (
            item.id == "nypsi_crate" &&
            (["collectable", "sellable", "item", "car"].includes(items[i].role) || items[i].buy)
          ) {
            const chance = Math.floor(Math.random() * 7);

            if (chance != 2) continue;
          }

          if (items[i].rarity === 6) {
            const chance = Math.floor(Math.random() * 2000);

            if (chance == 7) crateItemsModified.push(i);
          } else if (items[i].rarity == 5) {
            const chance = Math.floor(Math.random() * 50);

            if (chance == 7) crateItemsModified.push(i);
          } else if (items[i].rarity == 4) {
            const chance = Math.floor(Math.random() * 15);
            if (chance == 4) {
              crateItemsModified.push(i);
            } else if (chance > 7 && item.id == "nypsi_crate") {
              for (let x = 0; x < 3; x++) {
                crateItemsModified.push(i);
              }
            }
          } else if (items[i].rarity == 3) {
            const chance = Math.floor(Math.random() * 3);
            if (chance == 2) {
              crateItemsModified.push(i);
            } else if (item.id == "nypsi_crate") {
              for (let x = 0; x < 3; x++) {
                crateItemsModified.push(i);
              }
            }
          } else if (items[i].rarity == 2) {
            if (item.id == "nypsi_crate") {
              for (let x = 0; x < 5; x++) {
                crateItemsModified.push(i);
              }
            }
            crateItemsModified.push(i);
          } else if (items[i].rarity == 1) {
            for (let x = 0; x < 2; x++) {
              if (items[i].role == "collectable" && item.id != "nypsi_crate") {
                const chance = Math.floor(Math.random() * 3);

                if (chance == 2) {
                  crateItemsModified.push(i);
                }
              } else {
                if (item.id == "nypsi_crate") {
                  const chance = Math.floor(Math.random() * 10);

                  if (chance < 7) {
                    crateItemsModified.push(i);
                  }
                } else {
                  crateItemsModified.push(i);
                }
              }
              crateItemsModified.push(i);
            }
          } else if (items[i].rarity == 0 && item.id != "nypsi_crate") {
            if (items[i].role == "collectable") {
              const chance = Math.floor(Math.random() * 3);

              if (chance == 2) {
                crateItemsModified.push(i);
              }
            } else {
              crateItemsModified.push(i);
            }
            crateItemsModified.push(i);
          }
        } else {
          if (item.id == "nypsi_crate") {
            for (let x = 0; x < 6; x++) {
              crateItemsModified.push("money:10000000");
              crateItemsModified.push("xp:1000");
            }
          }
          for (let x = 0; x < 2; x++) {
            crateItemsModified.push(i);
            crateItemsModified.push(i);
          }
        }
      }

      const chosen = crateItemsModified[Math.floor(Math.random() * crateItemsModified.length)];

      if (chosen.includes("money:") || chosen.includes("xp:")) {
        if (chosen.includes("money:")) {
          const amount = parseInt(chosen.substring(6));
          addStat(member, "earned-crates", amount);
          await addBalance(member, amount);
          found.set("money", found.has("money") ? found.get("money") + amount : amount);
        } else if (chosen.includes("xp:")) {
          const amount = parseInt(chosen.substring(3));

          await addXp(member, amount);
          const guild = await getGuildName(member);

          if (guild) {
            await addToGuildXP(guild, amount, member);
          }

          found.set("xp", found.has("xp") ? found.get("xp") + amount : amount);
        }
      } else {
        let amount = 1;

        if (
          chosen == "terrible_fishing_rod" ||
          chosen == "terrible_gun" ||
          chosen == "wooden_pickaxe"
        ) {
          amount = 5;
        } else if (chosen == "fishing_rod" || chosen == "gun" || chosen == "iron_pickaxe") {
          amount = 10;
        } else if (
          chosen == "incredible_fishing_rod" ||
          chosen == "incredible_gun" ||
          chosen == "diamond_pickaxe"
        ) {
          amount = 10;
        } else if (chosen == "gem_shard" && item.id === "gem_crate") {
          amount = Math.floor(Math.random() * 15) + 5;
        }

        await addInventoryItem(member, chosen, amount);

        if (chosen.includes("_gem"))
          await addProgress(typeof member === "string" ? member : member.user.id, "gem_hunter", 1);

        found.set(chosen, found.has(chosen) ? found.get(chosen) + amount : amount);
      }
    }
  } else {
    for (let i = 0; i < times; i++) {
      crateItems.length = 0;

      for (const itemFilter of item.items) {
        if (parseFloat(itemFilter.split(":")[2])) {
          if (!percentChance(parseFloat(itemFilter.split(":")[2]))) {
            continue;
          }
        }

        let filteredItems: string[] = [];

        if (itemFilter.startsWith("id:")) {
          filteredItems = Object.keys(items).filter((i) => i === itemFilter.split(":")[1]);
        } else if (itemFilter.startsWith("role:")) {
          filteredItems = Object.keys(items).filter(
            (i) => items[i].role === itemFilter.split(":")[1],
          );
        } else {
          crateItems.push(itemFilter);
          continue;
        }

        crateItems.push(...filteredItems);
      }

      const chosen = crateItems[Math.floor(Math.random() * crateItems.length)];

      if (chosen.includes("money:") || chosen.includes("xp:")) {
        if (chosen.includes("money:")) {
          const amount = parseInt(chosen.split(":")[1]);
          addStat(member, "earned-crates", amount);
          await addBalance(member, amount);
          found.set("money", found.has("money") ? found.get("money") + amount : amount);
        } else if (chosen.includes("xp:")) {
          const amount = parseInt(chosen.split(":")[1]);

          await addXp(member, amount);
          const guild = await getGuildName(member);

          if (guild) {
            await addToGuildXP(guild, amount, member);
          }

          found.set("xp", found.has("xp") ? found.get("xp") + amount : amount);
        }
      } else {
        let amount = 1;

        if (
          chosen == "terrible_fishing_rod" ||
          chosen == "terrible_gun" ||
          chosen == "wooden_pickaxe"
        ) {
          amount = 5;
        } else if (chosen == "fishing_rod" || chosen == "gun" || chosen == "iron_pickaxe") {
          amount = 10;
        } else if (
          chosen == "incredible_fishing_rod" ||
          chosen == "incredible_gun" ||
          chosen == "diamond_pickaxe"
        ) {
          amount = 10;
        } else if (chosen == "gem_shard" && item.id === "gem_crate") {
          amount = Math.floor(Math.random() * 15) + 5;
        }

        await addInventoryItem(member, chosen, amount);

        if (chosen.includes("_gem"))
          await addProgress(typeof member === "string" ? member : member.user.id, "gem_hunter", 1);

        found.set(chosen, found.has(chosen) ? found.get(chosen) + amount : amount);
      }
    }
  }

  return found;
}

export async function getTotalAmountOfItem(itemId: string) {
  const query = await prisma.inventory.aggregate({
    where: {
      item: itemId,
    },
    _sum: {
      amount: true,
    },
  });

  return Number(query._sum.amount);
}

export function selectItem(search: string) {
  let selected: Item;
  const items = getItems();

  for (const itemName of Array.from(Object.keys(items))) {
    const aliases = items[itemName].aliases ? items[itemName].aliases : [];
    if (search == itemName) {
      selected = items[itemName];
      break;
    } else if (search == itemName.split("_").join("")) {
      selected = items[itemName];
      break;
    } else if (aliases.indexOf(search) != -1) {
      selected = items[itemName];
      break;
    } else if (search == items[itemName].name) {
      selected = items[itemName];
      break;
    } else if (search == items[itemName].plural) {
      selected = items[itemName];
    }
  }

  return selected;
}

export async function commandGemCheck(member: GuildMember, commandCategory: CommandCategory) {
  if (await redis.exists(Constants.redis.nypsi.GEM_GIVEN)) return;
  if (!(await userExists(member))) return;
  if (!(await getDmSettings(member)).other) return;
  if (gemChanceCooldown.has(member.user.id)) return;
  gemChanceCooldown.add(member.user.id);

  if (percentChance(0.001)) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
    await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
    const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

    const gem = gems[Math.floor(Math.random() * gems.length)];

    await addInventoryItem(member, gem, 1);
    addProgress(member.user.id, "gem_hunter", 1);

    if ((await getDmSettings(member)).other) {
      await addNotificationToQueue({
        memberId: member.user.id,
        payload: {
          embed: new CustomEmbed(
            member,
            `${getItems()[gem].emoji} you've found a gem! i wonder what powers it holds...`,
          )
            .setTitle("you've found a gem")
            .setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      });
    }
  }

  if (commandCategory == "moderation") {
    if (percentChance(0.07)) {
      await addInventoryItem(member, "pink_gem", 1);
      addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        await addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["pink_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            )
              .setTitle("you've found a gem")
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        });
      }
    }
  } else if (commandCategory == "animals") {
    if (percentChance(0.007)) {
      await addInventoryItem(member, "purple_gem", 1);
      addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        await addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${
                getItems()["purple_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            )
              .setTitle("you've found a gem")
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        });
      }
    }
  }
}

export async function gemBreak(userId: string, chance: number, gem: string) {
  if (!percentChance(chance)) return;

  const inventory = await getInventory(userId);

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) return;
  if (!inventory.find((i) => i.item === gem)) return;

  let uniqueGemCount = 0;

  inventory.forEach((i) => {
    if (i.item.includes("_gem")) uniqueGemCount++;
  });

  if (uniqueGemCount === 5 && percentChance(50) && (await getDmSettings(userId)).other) {
    await Promise.all([
      setInventoryItem(userId, "pink_gem", inventory.find((i) => i.item === "pink_gem").amount - 1),
      setInventoryItem(
        userId,
        "purple_gem",
        inventory.find((i) => i.item === "purple_gem").amount - 1,
      ),
      setInventoryItem(userId, "blue_gem", inventory.find((i) => i.item === "blue_gem").amount - 1),
      setInventoryItem(
        userId,
        "green_gem",
        inventory.find((i) => i.item === "green_gem").amount - 1,
      ),
      setInventoryItem(
        userId,
        "white_gem",
        inventory.find((i) => i.item === "white_gem").amount - 1,
      ),
      prisma.crafting.create({
        data: {
          amount: 1,
          finished: dayjs().add(7, "days").toDate(),
          itemId: "crystal_heart",
          userId,
        },
      }),
    ]);

    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed()
          .setColor(Constants.TRANSPARENT_EMBED_COLOR)
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

  await setInventoryItem(userId, gem, inventory.find((i) => i.item === gem).amount - 1);

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
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed()
          .setColor(Constants.TRANSPARENT_EMBED_COLOR)
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

  await redis.set(`${Constants.redis.cache.economy.AUTO_SELL}:${id}`, JSON.stringify(query));
  await redis.expire(
    `${Constants.redis.cache.economy.AUTO_SELL}:${id}`,
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

export async function calcItemValue(item: string) {
  let itemValue = 1000;

  if (
    getItems()[item].buy ||
    item === "cookie" ||
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
    if (!auctionAvg && !offersAvg) return getItems()[item].sell || 1000;

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
