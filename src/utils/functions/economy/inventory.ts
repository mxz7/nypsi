import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { Item } from "../../models/Economy";
import workerSort from "../../workers/sort";
import { addProgress, getAllAchievements, setAchievementProgress } from "./achievements";
import { getBalance, updateBalance } from "./balance";
import { getPrestige } from "./prestige";
import { addItemUse } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import { getXp, updateXp } from "./xp";

const inventoryAchievementCheckCooldown = new Set<string>();

type Inventory = { [key: string]: number };

export async function topAmountItem(guild: Guild, amount: number, item: string): Promise<string[]> {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ money: { gt: 0 } }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
      inventory: true,
    },
  });

  const amounts = new Map<string, number>();
  let userIDs = query
    .filter((i) => {
      const inventory = i.inventory as Inventory;

      if (inventory[item]) {
        amounts.set(i.userId, inventory[item]);
        return true;
      } else {
        return false;
      }
    })
    .map((i) => i.userId);

  if (userIDs.length > 500) {
    userIDs = await workerSort(userIDs, amounts);
    userIDs.reverse();
  } else {
    inPlaceSort(userIDs).desc((i) => amounts.get(i));
  }

  const usersFinal = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of userIDs) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (amounts.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      const items = getItems();

      usersFinal[count] =
        pos +
        " **" +
        getMemberID(guild, user).user.tag +
        "** " +
        amounts.get(user).toLocaleString() +
        ` ${items[item].name}${amounts.get(user) > 1 ? (items[item].name.endsWith("s") ? "" : "s") : ""}`;
      count++;
    }
  }
  return usersFinal;
}

export async function getInventory(member: GuildMember | string, checkAchievement = false): Promise<Inventory> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:economy:inventory:${id}`)) {
    return JSON.parse(await redis.get(`cache:economy:inventory:${id}`));
  }

  const query = await prisma.economy
    .findUnique({
      where: {
        userId: id,
      },
      select: {
        inventory: true,
      },
    })
    .catch(() => {});

  if (!query) {
    if (!(await userExists(id))) await createUser(id);
    await redis.set(`cache:economy:inventory:${id}`, "{}");
    await redis.expire(`cache:economy:inventory:${id}`, 180);
    return {};
  }

  if (!query.inventory) {
    await redis.set(`cache:economy:inventory:${id}`, "{}");
    await redis.expire(`cache:economy:inventory:${id}`, 180);
    return {};
  }

  await redis.set(`cache:economy:inventory:${id}`, JSON.stringify(query.inventory));
  await redis.expire(`cache:economy:inventory:${id}`, 180);

  if (checkAchievement && !inventoryAchievementCheckCooldown.has(id)) {
    inventoryAchievementCheckCooldown.add(id);
    setTimeout(() => {
      inventoryAchievementCheckCooldown.delete(id);
    }, 60000);

    await checkCollectorAchievement(id, query.inventory as Inventory);
  }

  return query.inventory as Inventory;
}

export async function setInventory(member: GuildMember | string, inventory: Inventory, checkAchievement = true) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.economy.update({
    where: {
      userId: id,
    },
    data: {
      inventory: inventory,
    },
  });

  await redis.del(`cache:economy:inventory:${id}`);

  if (!inventoryAchievementCheckCooldown.has(id) && checkAchievement) {
    inventoryAchievementCheckCooldown.add(id);
    setTimeout(() => {
      inventoryAchievementCheckCooldown.delete(id);
    }, 60000);

    await checkCollectorAchievement(id, inventory);
  }
}

async function checkCollectorAchievement(id: string, inventory: Inventory) {
  let itemCount = 0;

  for (const itemId of Object.keys(inventory)) {
    itemCount += inventory[itemId];
  }

  const achievements = await getAllAchievements(id);
  let collectorCount = 0;

  for (const achievement of achievements) {
    if (achievement.achievementId.includes("collector")) collectorCount++;
    // will always return if a valid achievement is found
    if (achievement.achievementId.includes("collector") && !achievement.completed) {
      if (achievement.progress != itemCount) {
        await setAchievementProgress(id, achievement.achievementId, itemCount);
      }
      return;
    }
  }

  switch (collectorCount) {
    case 0:
      await setAchievementProgress(id, "collector_i", itemCount);
      break;
    case 1:
      await setAchievementProgress(id, "collector_ii", itemCount);
      break;
    case 2:
      await setAchievementProgress(id, "collector_iii", itemCount);
      break;
    case 3:
      await setAchievementProgress(id, "collector_iv", itemCount);
      break;
    case 4:
      await setAchievementProgress(id, "collector_v", itemCount);
      break;
  }
}

export async function getMaxBitcoin(member: GuildMember): Promise<number> {
  const base = 10;

  const prestige = await getPrestige(member);

  const prestigeBonus = 5 * (prestige > 15 ? 15 : prestige);

  let xpBonus = 1 * Math.floor((await getXp(member)) / 100);

  if (xpBonus > 5) xpBonus = 5;

  return base + prestigeBonus + xpBonus;
}

export async function getMaxEthereum(member: GuildMember): Promise<number> {
  return (await getMaxBitcoin(member)) * 10;
}

export async function openCrate(member: GuildMember, item: Item): Promise<string[]> {
  const inventory = await getInventory(member);
  const items = getItems();

  const crateItems = ["money:50000", "money:100000", "xp:25", "xp:50"];

  for (const i of Array.from(Object.keys(items))) {
    if (
      items[i].role == "fish" ||
      items[i].role == "prey" ||
      items[i].id == "gold_ore" ||
      items[i].id == "iron_ore" ||
      items[i].id == "cobblestone"
    )
      continue;
    crateItems.push(i);
  }

  inventory[item.id] -= 1;

  if (inventory[item.id] == 0) {
    delete inventory[item.id];
  }

  await setInventory(member, inventory);
  await addItemUse(member, item.id);
  await addProgress(member.user.id, "unboxer", 1);

  let times = 2;
  const names = [];

  if (item.id.includes("vote")) {
    times = 1;
  } else if (item.id.includes("69420")) {
    await updateBalance(member, (await getBalance(member)) + 69420);
    names.push("$69,420");
  }

  for (let i = 0; i < times; i++) {
    const crateItemsModified = [];

    for (const i of crateItems) {
      if (items[i]) {
        if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 15);
          if (chance == 4) {
            crateItemsModified.push(i);
          }
        } else if (items[i].rarity == 3) {
          const chance = Math.floor(Math.random() * 3);
          if (chance == 2) {
            crateItemsModified.push(i);
          }
        } else if (items[i].rarity == 2) {
          crateItemsModified.push(i);
        } else if (items[i].rarity == 1) {
          for (let x = 0; x < 2; x++) {
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
        } else if (items[i].rarity == 0) {
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
        for (let x = 0; x < 2; x++) {
          crateItemsModified.push(i);
          crateItemsModified.push(i);
        }
      }
    }

    const chosen = crateItemsModified[Math.floor(Math.random() * crateItemsModified.length)];

    if (chosen == "bitcoin") {
      const owned = inventory["bitcoin"] || 0;
      const max = await getMaxBitcoin(member);

      if (owned + 1 > max) {
        i--;
        continue;
      } else {
        if (inventory[chosen]) {
          inventory[chosen] += 1;
        } else {
          inventory[chosen] = 1;
        }
        names.push(`${items[chosen].emoji} ${items[chosen].name}`);
      }
    } else if (chosen == "ethereum") {
      const owned = inventory["ethereum"] || 0;
      const max = await getMaxEthereum(member);

      if (owned + 1 > max) {
        i--;
        continue;
      } else {
        if (inventory[chosen]) {
          inventory[chosen] += 1;
        } else {
          inventory[chosen] = 1;
        }
        names.push(`${items[chosen].emoji} ${items[chosen].name}`);
      }
    } else if (chosen.includes("money:") || chosen.includes("xp:")) {
      if (chosen.includes("money:")) {
        const amount = parseInt(chosen.substr(6));

        await updateBalance(member, (await getBalance(member)) + amount);
        names.push("$" + amount.toLocaleString());
      } else if (chosen.includes("xp:")) {
        const amount = parseInt(chosen.substr(3));

        await updateXp(member, (await getXp(member)) + amount);
        names.push(amount + "xp");
      }
    } else {
      let amount = 1;

      if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun" || chosen == "wooden_pickaxe") {
        amount = 5;
      } else if (chosen == "fishing_rod" || chosen == "gun" || chosen == "iron_pickaxe") {
        amount = 10;
      } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun" || chosen == "diamond_pickaxe") {
        amount = 10;
      }

      if (inventory[chosen]) {
        inventory[chosen] += amount;
      } else {
        inventory[chosen] = amount;
      }
      names.push(`${items[chosen].emoji} ${items[chosen].name}`);
    }
  }

  await setInventory(member, inventory);

  return names;
}
