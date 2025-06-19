import redis from "../../init/redis";
import { ErrorEmbed } from "../../models/EmbedBuilders";
import { getBoosters } from "../functions/economy/boosters";
import { getGuildUpgradesByUser } from "../functions/economy/guilds";
import { getItems } from "../functions/economy/utils";
import { getUserId, MemberResolvable } from "../functions/member";
import { isBooster } from "../functions/premium/boosters";
import { getTier, isPremium } from "../functions/premium/premium";
import { logger } from "../logger";

export async function onCooldown(cmd: string, member: MemberResolvable): Promise<boolean> {
  const key = `cd:${cmd}:${getUserId(member)}`;

  const res = await redis.exists(key);

  return res == 1 ? true : false;
}

export async function addCooldown(cmd: string, member: MemberResolvable, seconds?: number) {
  const key = `cd:${cmd}:${getUserId(member)}`;

  let expireDisabled = false;

  if (!seconds) {
    expireDisabled = true;
    seconds = 69420;
  }

  const expire = await calculateCooldownLength(seconds, member);

  const data: CooldownData = {
    date: Date.now(),
    length: expire,
  };

  if (!expireDisabled) await redis.set(key, JSON.stringify(data), "PX", expire);
  else await redis.set(key, JSON.stringify(data));
}

export async function addExpiry(cmd: string, member: MemberResolvable, seconds: number) {
  const key = `cd:${cmd}:${getUserId(member)}`;

  const expire = await calculateCooldownLength(seconds, member);

  const data: CooldownData = {
    date: Date.now(),
    length: expire,
  };

  await redis.set(key, JSON.stringify(data), "PX", expire);
}

export async function getRemaining(cmd: string, member: MemberResolvable) {
  const key = `cd:${cmd}:${getUserId(member)}`;
  const cd: CooldownData = JSON.parse(await redis.get(key));

  if (!cd) {
    return "0.1s";
  }

  const init = cd.date;
  const length = cd.length;

  const diff = Date.now() - init;
  const time = (length - diff) / 1000;

  const minutes = Math.floor(time / 60);
  const seconds = (time - minutes * 60).toFixed(1);

  let remaining: string;

  if (minutes != 0) {
    remaining = `${minutes}m${Math.floor(parseFloat(seconds))}s`;
  } else {
    remaining = `${seconds}s`;
  }

  return remaining;
}

type CooldownResponseInvalid = {
  respond: false;
};

type CooldownResponseValid = {
  respond: true;
  embed: ErrorEmbed;
};

export async function getResponse(
  cmd: string,
  member: MemberResolvable,
): Promise<CooldownResponseValid | CooldownResponseInvalid> {
  const userId = getUserId(member);

  const responseCooldown = await redis.exists(`cd:response:${userId}`);

  if (responseCooldown) return { respond: false };
  else await redis.set(`cd:response:${userId}`, "meow", "EX", 1);

  const key = `cd:${cmd}:${userId}`;
  const cd: CooldownData = JSON.parse(await redis.get(key));

  if (!cd) {
    logger.debug("invalid cd");
    return { respond: true, embed: new ErrorEmbed("you are on cooldown for `0.1s`").removeTitle() };
  }

  const init = cd.date;
  const length = cd.length;

  const diff = Date.now() - init;
  const time = (length - diff) / 1000;

  const minutes = Math.floor(time / 60);
  const seconds = (time - minutes * 60).toFixed(1);

  let remaining: string;

  if (minutes != 0) {
    remaining = `${minutes}m${Math.floor(parseFloat(seconds))}s`;
  } else {
    remaining = `${seconds}s`;
  }

  const embed = new ErrorEmbed(`you are on cooldown for \`${remaining}\``).removeTitle();

  if (remaining === "0.0s" || remaining.includes("-")) {
    await redis.del(key);
    embed.setDescription("you are on cooldown for `0.1s`");
  }

  const random = Math.floor(Math.random() * 50);

  if (random == 7 && !(await isPremium(member))) {
    embed.setFooter({ text: "premium members get 50% shorter cooldowns (/premium)" });
  }

  return { respond: true, embed };
}

async function calculateCooldownLength(seconds: number, member: MemberResolvable): Promise<number> {
  const [premiumTier, booster, guildUpgrades, boosters] = await Promise.all([
    getTier(member),
    isBooster(member),
    getGuildUpgradesByUser(member),
    getBoosters(member),
  ]);

  let ms = seconds * 1000;

  if (premiumTier == 4) {
    ms = ms * 0.5;
  } else if (premiumTier > 0) {
    ms = ms * 0.8;
  }

  if (booster) {
    ms = ms * 0.9;
  }

  if (guildUpgrades.find((i) => i.upgradeId === "cooldown")) {
    ms = ms * (1 - 0.05 * guildUpgrades.find((i) => i.upgradeId === "cooldown").amount);
  }

  const items = getItems();

  for (const id of boosters.keys()) {
    if (items[id].boosterEffect.boosts.includes("cooldown")) {
      ms -= ms * items[id].boosterEffect.effect;
    }
  }

  if (ms < 250) ms = 250;

  return Math.ceil(ms);
}

interface CooldownData {
  date: number;
  length: number;
}
