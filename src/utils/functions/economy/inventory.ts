import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { Categories } from "../../../models/Command";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addProgress, getAllAchievements, setAchievementProgress } from "./achievements";
import { getBalance, updateBalance } from "./balance";
import { addItemUse } from "./stats";
import { createUser, getItems, userExists } from "./utils";
import { getXp, updateXp } from "./xp";

const inventoryAchievementCheckCooldown = new Set<string>();
const gemChanceCooldown = new Set<string>();
setInterval(() => {
  gemChanceCooldown.clear();
}, 60000);

type Inventory = {
  item: string;
  amount: number;
}[];

export async function getInventory(
  member: GuildMember | string,
  checkAchievement = false
): Promise<{ item: string; amount: number }[]> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.INVENTORY}:${id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.INVENTORY}:${id}`));
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
    .catch(() => {});

  if (!query || query.length == 0) {
    if (!(await userExists(id))) await createUser(id);
    await redis.set(`${Constants.redis.cache.economy.INVENTORY}:${id}`, "[]");
    await redis.expire(`${Constants.redis.cache.economy.INVENTORY}:${id}`, 180);
    return [];
  }

  await redis.set(`${Constants.redis.cache.economy.INVENTORY}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.economy.INVENTORY}:${id}`, 180);

  setTimeout(async () => {
    if (checkAchievement && !inventoryAchievementCheckCooldown.has(id)) {
      inventoryAchievementCheckCooldown.add(id);
      setTimeout(() => {
        inventoryAchievementCheckCooldown.delete(id);
      }, 60000);

      await checkCollectorAchievement(id, query);
    }
  }, 1000);

  return query;
}

export async function addInventoryItem(
  member: GuildMember | string,
  itemId: string,
  amount: number,
  checkAchievement = true
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

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
      amount: { increment: amount },
    },
    create: {
      userId: id,
      item: itemId,
      amount: amount,
    },
  });

  if (itemId.endsWith("gem")) logger.info(`${id} received: ${itemId}`);

  await redis.del(`${Constants.redis.cache.economy.INVENTORY}:${id}`);

  setTimeout(async () => {
    if (!inventoryAchievementCheckCooldown.has(id) && checkAchievement) {
      inventoryAchievementCheckCooldown.add(id);
      setTimeout(() => {
        inventoryAchievementCheckCooldown.delete(id);
      }, 60000);

      checkCollectorAchievement(id, await getInventory(id, false));
    }
  }, 500);
}

export async function setInventoryItem(
  member: GuildMember | string,
  itemId: string,
  amount: number,
  checkAchievement = true
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

  if (!inventoryAchievementCheckCooldown.has(id) && checkAchievement) {
    inventoryAchievementCheckCooldown.add(id);
    setTimeout(() => {
      inventoryAchievementCheckCooldown.delete(id);
    }, 60000);

    checkCollectorAchievement(id, await getInventory(id, false));
  }
}

async function checkCollectorAchievement(id: string, inventory: Inventory) {
  let itemCount = 0;

  for (const item of inventory) {
    itemCount += item.amount;
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

export async function openCrate(member: GuildMember | string, item: Item): Promise<Map<string, number>> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const inventory = await getInventory(member);
  const items = getItems();

  if (!inventory.find((i) => i.item === item.id) || inventory.find((i) => i.item === item.id).amount < 1) {
    return new Map();
  }

  const crateItems: string[] = [];

  for (const i of Array.from(Object.keys(items))) {
    if (!items[i].in_crates) continue;
    crateItems.push(i);
  }

  await setInventoryItem(member, item.id, inventory.find((i) => i.item == item.id).amount - 1);

  await addItemUse(id, item.id);
  await addProgress(id, "unboxer", 1);

  let times = 2;
  const found = new Map<string, number>();

  if (item.id.includes("vote") || item.id.includes("chest")) {
    times = 1;
  } else if (item.id.includes("69420")) {
    await updateBalance(member, (await getBalance(member)) + 69420);
    found.set("money", 69420);
  } else if (item.id == "nypsi_crate") {
    times = 5;
  }

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

        if (items[i].rarity == 5) {
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
            crateItemsModified.push("xp:750");
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
        const amount = parseInt(chosen.substr(6));

        await updateBalance(member, (await getBalance(member)) + amount);
        found.set("money", found.has("money") ? found.get("money") + amount : amount);
      } else if (chosen.includes("xp:")) {
        const amount = parseInt(chosen.substr(3));

        await updateXp(member, (await getXp(member)) + amount);
        found.set("xp", found.has("xp") ? found.get("xp") + amount : amount);
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

      await addInventoryItem(member, chosen, amount);

      found.set(chosen, found.has(chosen) ? found.get(chosen) + amount : amount);
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

  return query._sum.amount;
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

export async function commandGemCheck(member: GuildMember, commandCategory: string) {
  if (!(await userExists(member))) return;
  if (gemChanceCooldown.has(member.user.id)) return;
  gemChanceCooldown.add(member.user.id);

  const chance = Math.floor(Math.random() * 100000);

  if (chance == 777) {
    const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

    const gem = gems[Math.floor(Math.random() * gems.length)];

    await addInventoryItem(member, gem, 1);
    await addProgress(member.user.id, "gem_hunter", 1);

    if ((await getDmSettings(member)).other) {
      await addNotificationToQueue({
        memberId: member.user.id,
        payload: {
          embed: new CustomEmbed(
            member,
            `${getItems()[gem].emoji} you've found a gem! i wonder what powers it holds...`
          ).setTitle("you've found a gem"),
        },
      });
    }
  }

  if (commandCategory == Categories.MODERATION) {
    const chance = Math.floor(Math.random() * 1000);

    if (chance == 77) {
      await addInventoryItem(member, "pink_gem", 1);
      await addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        await addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${getItems()["pink_gem"].emoji} you've found a gem! i wonder what powers it holds...`
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  } else if (commandCategory == Categories.ANIMALS || commandCategory == Categories.NSFW) {
    const chance = Math.floor(Math.random() * 1000);

    if (chance == 77) {
      await addInventoryItem(member, "purple_gem", 1);
      await addProgress(member.user.id, "gem_hunter", 1);

      if ((await getDmSettings(member)).other) {
        await addNotificationToQueue({
          memberId: member.user.id,
          payload: {
            embed: new CustomEmbed(
              member,
              `${getItems()["purple_gem"].emoji} you've found a gem! i wonder what powers it holds...`
            ).setTitle("you've found a gem"),
          },
        });
      }
    }
  }
}
