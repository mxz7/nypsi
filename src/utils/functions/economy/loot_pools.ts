import { GuildMember } from "discord.js";
import { Item } from "../../../types/Economy";
import { LootPool, LootPoolResult } from "../../../types/LootPool";
import { logger } from "../../logger";
import { percentChance } from "../random";
import { addProgress } from "./achievements";
import { addBalance } from "./balance";
import { addToGuildXP, getGuildName } from "./guilds";
import { addStat } from "./stats";
import { getItems, getLootPools } from "./utils";
import { addXp } from "./xp";
import { addInventoryItem, getInventory, itemExists, setInventoryItem } from "./inventory";
import { addKarma } from "../karma/karma";

export function getBasicLootPool(): LootPool {
    let lootPool: LootPool = {
        money: {
            50000: 100,
            100000: 100,
            500000: 100
        },
        xp: {
            50: 100,
            100: 100,
            250: 100
        },
        items: {}
    }
    const items = getItems()
    const rarityToWeight = [1000, 400, 100, 100/3, 20/3, 2, 0.05]
    for(const i in items) {
        const item = items[i];
        
        if(!item.in_crates || item.rarity > rarityToWeight.length) { continue; }
    
        let weight = rarityToWeight[item.rarity];
        if (item.rarity === 6 && item.role === "tag") {
            weight *= 0.01;
        }
        if(item.rarity in [0, 1] && item.role in ["collectable", "flower", "cat"]) {
            weight *= 2/3;
        }

        lootPool.items[i] = weight;
    }
    return lootPool;
}

export async function giveLootPoolResult(member: string | GuildMember, result: LootPoolResult) {
  if(Object.hasOwn(result, "money")) {
    await addBalance(member, result.money);
  }
  if(Object.hasOwn(result, "xp")) {
    await addXp(member, result.xp);
    const guild = await getGuildName(member);
    if (guild) {
      await addToGuildXP(guild, result.xp, member);
    }
  }
  if(Object.hasOwn(result, "karma")) {
    await addKarma(member, result.karma);
  }
  if(Object.hasOwn(result, "item")) {
    await addInventoryItem(member, result.item, Object.hasOwn(result, "count") ? result.count : 1);
  }
}

export function describeLootPoolResult(result: LootPoolResult): string {
  if(Object.hasOwn(result, "money")) {
    return `$${result.money.toLocaleString()}`
  }
  if(Object.hasOwn(result, "xp")) {
    return `**${result.xp}xp`
  }
  if(Object.hasOwn(result, "karma")) {
    return `${result.karma} karma 🔮`
  }
  if(Object.hasOwn(result, "item")) {
    const item = getItems()[result.item];
    const article = result.count === 1 ? item.article : `\`x${result.count ?? 1}\``;
    return `${article} ${item.emoji} **${item.name}**`
  }
  logger.error("could not describe loot pool result")
  return ""; // this shouldnt be reached
}

export function rollLootPool(loot_pool: LootPool, excluded_items: string[]): LootPoolResult {
    const totalWeight = getTotalWeight(loot_pool, excluded_items);
    let randomValue = Math.random() * totalWeight;

    if(Object.hasOwn(loot_pool, "nothing")) {
        if(randomValue < loot_pool.nothing) {
            return {};
        }
        randomValue -= loot_pool.nothing;
    }
    if(Object.hasOwn(loot_pool, "money")) {
        for(const amount in loot_pool.money) {
            if(randomValue < loot_pool.money[amount]) {
                return { money: parseInt(amount) };
            }
            randomValue -= loot_pool.money[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "xp")) {
        for(const amount in loot_pool.xp) {
            if(randomValue < loot_pool.xp[amount]) {
                return { xp: parseInt(amount) };
            }
            randomValue -= loot_pool.xp[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "karma")) {
        for(const amount in loot_pool.karma) {
            if(randomValue < loot_pool.karma[amount]) {
                return { karma: parseInt(amount) };
            }
            randomValue -= loot_pool.karma[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "items")) {
        for(const itemKey in loot_pool.items) {
            if(itemKey in excluded_items) { continue; }
            const itemLootData = loot_pool.items[itemKey];
            let itemWeight = getItemWeight(itemLootData);
            if(randomValue < itemWeight) {
              return { item: itemKey, count: getItemCount(itemLootData, itemKey) };
            }
            randomValue -= itemWeight;
        }
    }

    logger.error("loot pool roll reached terminus");
    return {}; // this shouldnt be reached
}

function getTotalWeight(loot_pool: LootPool, excluded_items: string[]): number {
    let totalWeight = 0;

    if(Object.hasOwn(loot_pool, "nothing")) {
        totalWeight += loot_pool.nothing;
    }
    if(Object.hasOwn(loot_pool, "money")) {
        for(const amount in loot_pool.money) {
            totalWeight += loot_pool.money[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "xp")) {
        for(const amount in loot_pool.xp) {
            totalWeight += loot_pool.xp[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "karma")) {
        for(const amount in loot_pool.karma) {
            totalWeight += loot_pool.karma[amount];
        }
    }
    if(Object.hasOwn(loot_pool, "items")) {
        for(const item in loot_pool.items) {
            if(item in excluded_items) { continue; }
            totalWeight += getItemWeight(loot_pool.items.item);
        }
    }
    return totalWeight;
}

function getItemWeight(data: { weight?: number, count?: number } | number): number {
  const defaultWeight = 100;
  if(typeof data === "number") { return defaultWeight; }
  if(Object.hasOwn(data, "weight")) { return data.weight; }
  return defaultWeight;
}

function getItemCount(data: { weight?: number, count?: number } | number, itemId: string): number {
  const item = getItems()[itemId];
  if(typeof data !== "object" || !Object.hasOwn(data, "count")) {
    if(!Object.hasOwn(item, "default_count")) { return 1; }
    return item.default_count;
  }
  return data.count;
}

export async function openCrate(
  member: GuildMember | string,
  item: Item,
): Promise<LootPoolResult[]> {
  const inventory = await getInventory(member);
  const items = getItems();

  if (
    !inventory.find((i) => i.item === item.id) ||
    inventory.find((i) => i.item === item.id).amount < 1
    || !Object.hasOwn(item, "loot_pools")
  ) {
    return [];
  }

  await setInventoryItem(member, item.id, inventory.find((i) => i.item == item.id).amount - 1);

  const crateItems: LootPoolResult[] = [];

  for(const poolName in item.loot_pools) {
    const pool = getLootPools()[poolName];
    const excluded_items = Object.keys(pool.items)
      .filter(e => getItems()[e].unique && itemExists(e));
    for(let i = 0; i < item.loot_pools[poolName]; i++) {
      crateItems.push(rollLootPool(pool, excluded_items));
    }
  }

  for(const i of crateItems) {
    await giveLootPoolResult(member, i);
  }
  return crateItems;
}
