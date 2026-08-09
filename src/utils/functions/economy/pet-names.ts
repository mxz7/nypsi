import { Pet } from "#generated/prisma";
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { RedisMutex } from "../mutex";
import { getBalance, removeBalance } from "./balance";
import { getUserPet, updatePet } from "./pets";

const petNamesMutex = new RedisMutex("pet-names");

const PET_NAME_BASE_COST = 10_000_000;
export const PET_NAME_REMOVAL_COST = PET_NAME_BASE_COST;

export function calcPetNameCost(namedPetCount: number) {
  return PET_NAME_BASE_COST * (namedPetCount + 1);
}

export function isValidPetName(name: string) {
  return name.length <= 16 && /^[a-z0-9]+(?: [a-z0-9]+)?$/i.test(name);
}

export async function setPetName(
  member: MemberResolvable,
  petId: string,
  name: string,
): Promise<Pet> {
  const userId = getUserId(member);
  await petNamesMutex.acquire(userId);

  try {
    const pet = await getUserPet(userId, petId);

    if (!pet) throw new Error("you have not unlocked this pet");
    if (!isValidPetName(name)) throw new Error("invalid pet name");
    if (pet.name === name) throw new Error("this pet already has that name");

    const namedPetCount = await prisma.pet.count({ where: { userId, name: { not: null } } });
    const cost = calcPetNameCost(namedPetCount);

    if ((await getBalance(userId)) < cost) {
      throw new Error("you cannot afford to change this pet's name");
    }
    await removeBalance(userId, cost);

    return updatePet(userId, petId, { name });
  } finally {
    petNamesMutex.release(userId);
  }
}

export async function removePetName(member: MemberResolvable, petId: string): Promise<Pet> {
  const userId = getUserId(member);
  await petNamesMutex.acquire(userId);

  try {
    const pet = await getUserPet(userId, petId);

    if (!pet) throw new Error("you have not unlocked this pet");
    if (!pet.name) throw new Error("this pet does not have a name");
    if ((await getBalance(userId)) < PET_NAME_REMOVAL_COST) {
      throw new Error("you cannot afford to remove this pet's name");
    }

    await removeBalance(userId, PET_NAME_REMOVAL_COST);
    return updatePet(userId, petId, { name: null });
  } finally {
    petNamesMutex.release(userId);
  }
}
