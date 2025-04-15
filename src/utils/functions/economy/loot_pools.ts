import { GuildMember } from "discord.js";
import { Item } from "../../../types/Economy";
import { LootPool, LootPoolItemEntry, LootPoolResult } from "../../../types/LootPool";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import { addProgress } from "./achievements";
import { addBalance } from "./balance";
import { addToGuildXP, getGuildName } from "./guilds";
import { addInventoryItem, getInventory, isGem, itemExists, setInventoryItem } from "./inventory";
import { getItems, getLootPools } from "./utils";
import { addXp } from "./xp";

export function getDefaultLootPool(predicate?: (item: Item) => boolean): LootPool {
  const lootPool: LootPool = {
    items: {},
  };
  const items = getItems();
  const rarityToWeight = [1000, 400, 100, 100 / 3, 20 / 3, 2, 0.05];
  for (const i in items) {
    const item = items[i];
    if (predicate && !predicate(item)) {
      continue;
    }
    if (item.rarity > rarityToWeight.length) {
      continue;
    }

    let weight = rarityToWeight[item.rarity];
    if (item.rarity === 6 && item.role === "tag") {
      weight *= 0.01;
    }
    if (item.rarity in [0, 1] && ["collectable", "flower", "cat"].includes(item.role)) {
      weight *= 2 / 3;
    }

    lootPool.items[i] = weight;
  }
  return lootPool;
}

export async function giveLootPoolResult(member: string | GuildMember, result: LootPoolResult) {
  if (Object.hasOwn(result, "money")) {
    await addBalance(member, result.money);
  }
  if (Object.hasOwn(result, "xp")) {
    await addXp(member, result.xp);
    const guild = await getGuildName(member);
    if (guild) {
      await addToGuildXP(guild, result.xp, member);
    }
  }
  if (Object.hasOwn(result, "karma")) {
    await addKarma(member, result.karma);
  }
  if (Object.hasOwn(result, "item")) {
    await addInventoryItem(member, result.item, Object.hasOwn(result, "count") ? result.count : 1);
    if (isGem(result.item)) {
      // @ts-expect-error
      await addProgress(member?.user?.id ?? member, "gem_hunter", result.count ?? 1);
    }
  }
}

export function describeLootPoolResult(result: LootPoolResult): string {
  if (Object.hasOwn(result, "money")) {
    return `$${result.money.toLocaleString()}`;
  }
  if (Object.hasOwn(result, "xp")) {
    return `**${result.xp}**xp`;
  }
  if (Object.hasOwn(result, "karma")) {
    return `**${result.karma}** karma 🔮`;
  }
  if (Object.hasOwn(result, "item")) {
    const item = getItems()[result.item];
    const article = result.count === 1 ? item.article : `\`${result.count ?? 1}x\``;
    return `${article} ${item.emoji} **${item.name}**`;
  }
  if (Object.keys(result).length === 0) {
    return "**nothing**";
  }
  logger.error("could not describe loot pool result");
  return ""; // this shouldnt be reached
}

export async function rollLootPool(
  loot_pool: LootPool,
  exclusionPredicate?: (itemId: string) => Promise<boolean>, // only works on items
): Promise<LootPoolResult> {
  let excludedItems = [] as string[];
  if (exclusionPredicate) {
    const poolItems = Object.keys(loot_pool.items ?? {});
    const exclusionResults = await Promise.all(poolItems.map(exclusionPredicate));
    excludedItems = poolItems.filter((e, i) => exclusionResults[i]);
  }
  let randomValue = Math.random() * getTotalWeight(loot_pool, excludedItems);

  if (Object.hasOwn(loot_pool, "nothing")) {
    if (randomValue < loot_pool.nothing) {
      return {};
    }
    randomValue -= loot_pool.nothing;
  }
  if (Object.hasOwn(loot_pool, "money")) {
    for (const amount in loot_pool.money) {
      if (randomValue < loot_pool.money[amount]) {
        return { money: parseInt(amount) };
      }
      randomValue -= loot_pool.money[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "xp")) {
    for (const amount in loot_pool.xp) {
      if (randomValue < loot_pool.xp[amount]) {
        return { xp: parseInt(amount) };
      }
      randomValue -= loot_pool.xp[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "karma")) {
    for (const amount in loot_pool.karma) {
      if (randomValue < loot_pool.karma[amount]) {
        return { karma: parseInt(amount) };
      }
      randomValue -= loot_pool.karma[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "items")) {
    for (const itemKey in loot_pool.items) {
      if (excludedItems.includes(itemKey)) {
        continue;
      }
      const itemLootData = loot_pool.items[itemKey];
      const itemWeight = getItemWeight(itemLootData);
      if (randomValue < itemWeight) {
        return { item: itemKey, count: getItemCount(itemLootData, itemKey) };
      }
      randomValue -= itemWeight;
    }
  }

  logger.error("loot pool roll reached terminus");
  return {}; // this shouldnt be reached
}

function getTotalWeight(loot_pool: LootPool, excludedItems: string[]): number {
  let totalWeight = 0;

  if (Object.hasOwn(loot_pool, "nothing")) {
    totalWeight += loot_pool.nothing;
  }
  if (Object.hasOwn(loot_pool, "money")) {
    for (const amount in loot_pool.money) {
      totalWeight += loot_pool.money[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "xp")) {
    for (const amount in loot_pool.xp) {
      totalWeight += loot_pool.xp[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "karma")) {
    for (const amount in loot_pool.karma) {
      totalWeight += loot_pool.karma[amount];
    }
  }
  if (Object.hasOwn(loot_pool, "items")) {
    for (const item in loot_pool.items) {
      if (excludedItems.includes(item)) {
        continue;
      }
      totalWeight += getItemWeight(loot_pool.items[item]);
    }
  }
  return totalWeight;
}

function getItemWeight(data: LootPoolItemEntry): number {
  if (typeof data === "number") {
    return data;
  }
  if (Object.hasOwn(data, "weight")) {
    return data.weight;
  }
  return 100; // default weight
}

function getItemCount(data: LootPoolItemEntry, itemId: string): number {
  const item = getItems()[itemId];
  if (typeof data !== "object" || !Object.hasOwn(data, "count")) {
    if (!Object.hasOwn(item, "default_count")) {
      return 1;
    }
    return item.default_count;
  }
  if (typeof data.count === "number") {
    return data.count;
  }
  return Math.floor(Math.random() * (data.count.max - data.count.min + 1) + data.count.min);
}

export async function openCrate(
  member: GuildMember | string,
  item: Item,
): Promise<LootPoolResult[]> {
  const inventory = await getInventory(member);

  if (
    !inventory.find((i) => i.item === item.id) ||
    inventory.find((i) => i.item === item.id).amount < 1 ||
    !Object.hasOwn(item, "loot_pools")
  ) {
    return [];
  }

  await setInventoryItem(member, item.id, inventory.find((i) => i.item == item.id).amount - 1);

  const crateItems: LootPoolResult[] = [];

  for (const poolName in item.loot_pools) {
    const pool = getLootPools()[poolName];
    for (let i = 0; i < item.loot_pools[poolName]; i++) {
      const item = await rollLootPool(
        pool,
        async (e) => getItems()[e].unique && (await itemExists(e)),
      );
      await giveLootPoolResult(member, item);
      crateItems.push(item);
    }
  }

  return crateItems;
}
