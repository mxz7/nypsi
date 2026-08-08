import { Pet } from "#generated/prisma";
import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { PetTarget } from "../../../types/Economy";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { RedisMutex } from "../mutex";
import { percentChance } from "../random";
import { addInlineNotification } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { getInventory, removeInventoryItem } from "./inventory";
import { getUpgrades } from "./levelling";
import { getItems, getPetsData } from "./utils";

const petsCache = new RedisCache<Pet[]>(Constants.redis.cache.economy.PETS, 180);
const petsMutex = new RedisMutex("pets");
const resultMessageTargets = new Set<PetTarget>(["bakery", "fish", "hunt", "mine"]);

export function getPetDisplayName(pet: Pet) {
  const item = getItems()[getPetsData()[pet.petId].item];
  return pet.name ?? item.name;
}

export function formatPetFoundItem(pet: Pet, found?: { itemId: string; amount: number }) {
  const items = getItems();
  const petItem = items[getPetsData()[pet.petId].item];

  if (!found) {
    return `${petItem.emoji} **${getPetDisplayName(pet)}** found **nothing**`;
  }

  const foundItem = items[found.itemId];
  return `${petItem.emoji} **${getPetDisplayName(pet)}** found \`${found.amount.toLocaleString()}x\` ${foundItem.emoji} **${foundItem.name}**`;
}

export function takePetFoundItem(foundItems: Map<string, number>) {
  const items = getItems();
  const itemId = Array.from(foundItems.keys()).find((entry) => items[entry]);

  if (!itemId) return;

  const amount = foundItems.get(itemId);
  foundItems.delete(itemId);

  return { itemId, amount };
}

export async function getUserPets(member: MemberResolvable): Promise<Pet[]> {
  const userId = getUserId(member);
  const cache = await petsCache.get(userId);

  if (cache) return cache;

  const pets = await prisma.pet.findMany({ where: { userId } });
  await petsCache.set(userId, pets);
  return pets;
}

export async function getUserPet(
  member: MemberResolvable,
  petId: string,
): Promise<Pet | undefined> {
  return (await getUserPets(member)).find((pet) => pet.petId === petId);
}

export async function addPet(member: MemberResolvable, petId: string): Promise<Pet> {
  const userId = getUserId(member);
  const petData = getPetsData()[petId];

  if (!petData) throw new Error("invalid pet");

  await petsMutex.acquire(userId);

  try {
    const pet = await prisma.pet.findUnique({
      where: { userId_petId: { userId, petId } },
    });
    const nextLevel = pet ? pet.level + 1 : 1;

    if (nextLevel > petData.items.length) throw new Error("pet is already at its maximum level");

    const requiredItems = petData.items[nextLevel - 1];
    const inventory = await getInventory(userId);

    if (inventory.count(petData.item) < requiredItems) {
      throw new Error(`you need ${requiredItems} pet items for the next level up`);
    }

    await removeInventoryItem(userId, petData.item, requiredItems);

    const updated = await prisma.pet.upsert({
      where: { userId_petId: { userId, petId } },
      create: { userId, petId, level: 1 },
      update: { level: nextLevel },
    });

    await petsCache.delete(userId);
    return updated;
  } finally {
    petsMutex.release(userId);
  }
}

export async function updatePet(
  member: MemberResolvable,
  petId: string,
  data: { level?: number; active?: boolean; activationIncrement?: number; name?: string | null },
): Promise<Pet> {
  const userId = getUserId(member);
  const pet = await prisma.pet.update({
    where: { userId_petId: { userId, petId } },
    data: {
      level: data.level,
      active: data.active,
      name: data.name,
      activations:
        data.activationIncrement === undefined
          ? undefined
          : { increment: data.activationIncrement },
    },
  });

  await petsCache.delete(userId);
  return pet;
}

export async function getActivePets(member: MemberResolvable): Promise<Pet[]> {
  return (await getUserPets(member)).filter((pet) => pet.active);
}

export async function getActivePetForTarget(
  member: MemberResolvable,
  target: PetTarget,
): Promise<Pet | undefined> {
  return (await getActivePets(member)).find((pet) => getPetsData()[pet.petId]?.target === target);
}

export async function getPetSlotCount(member: MemberResolvable): Promise<number> {
  const slotUpgrade = (await getUpgrades(member)).find(
    (upgrade) => upgrade.upgradeId === "pet_slots",
  );
  return Math.min(5, 1 + (slotUpgrade?.amount ?? 0));
}

export async function activatePet(member: MemberResolvable, petId: string): Promise<Pet> {
  const userId = getUserId(member);
  await petsMutex.acquire(userId);

  try {
    const pet = await prisma.pet.findUnique({ where: { userId_petId: { userId, petId } } });

    if (!pet) throw new Error("you have not unlocked this pet");
    if (pet.active) throw new Error("this pet is already active");

    const activeCount = await prisma.pet.count({ where: { userId, active: true } });
    if (activeCount >= (await getPetSlotCount(member))) {
      throw new Error("all of your active pet slots are occupied");
    }

    const updated = await prisma.pet.update({
      where: { userId_petId: { userId, petId } },
      data: { active: true },
    });
    await petsCache.delete(userId);
    return updated;
  } finally {
    petsMutex.release(userId);
  }
}

export async function deactivatePet(member: MemberResolvable, petId: string): Promise<Pet> {
  const pet = await getUserPet(member, petId);

  if (!pet) throw new Error("you have not unlocked this pet");
  if (!pet.active) throw new Error("this pet is not active");

  return updatePet(member, petId, { active: false });
}

async function addActivateNotification(user: MemberResolvable, pet: Pet) {
  if ((await getPreferences(user)).dms.petActivation) {
    const item = getItems()[getPetsData()[pet.petId].item];

    const userId = getUserId(user);

    await addInlineNotification({
      memberId: userId,
      embed: new CustomEmbed(userId, `your ${item.emoji} **${getPetDisplayName(pet)}** activated!`),
    });
  }
}

export async function rollPet(
  member: MemberResolvable,
  target: PetTarget,
): Promise<number | undefined> {
  const userId = getUserId(member);
  const [pet, inventory] = await Promise.all([
    getActivePetForTarget(member, target),
    getInventory(member),
  ]);
  if (!pet) return;

  const data = getPetsData()[pet.petId];
  const levelIndex = pet.level - 1;

  if (!percentChance(data.chance[levelIndex] * 100)) {
    if ((await inventory.hasGem("crystal_heart")).any) {
      if (!percentChance(0.1)) return;
    } else {
      return;
    }
  }

  logger.info(`pets: ${userId}'s ${pet.petId} activated`);
  await updatePet(member, pet.petId, { activationIncrement: 1 });

  if (!resultMessageTargets.has(target)) addActivateNotification(userId, pet);

  return data.benefit[levelIndex];
}
