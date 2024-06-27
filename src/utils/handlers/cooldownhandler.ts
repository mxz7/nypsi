import { GuildMember } from "discord.js";
import redis from "../../init/redis";
import { ErrorEmbed } from "../../models/EmbedBuilders";
import { getBoosters } from "../functions/economy/boosters";
import { getGuildUpgradesByUser } from "../functions/economy/guilds";
import { getItems } from "../functions/economy/utils";
import { isBooster } from "../functions/premium/boosters";
import { getTier, isPremium } from "../functions/premium/premium";

export async function onCooldown(cmd: string, member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const key = `cd:${cmd}:${id}`;

  const res = await redis.exists(key);

  return res == 1 ? true : false;
}

export async function addCooldown(cmd: string, member: GuildMember | string, seconds?: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const key = `cd:${cmd}:${id}`;

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

export async function addExpiry(cmd: string, member: GuildMember, seconds: number) {
  const key = `cd:${cmd}:${member.user.id}`;

  const expire = await calculateCooldownLength(seconds, member);

  const data: CooldownData = {
    date: Date.now(),
    length: expire,
  };

  await redis.set(key, JSON.stringify(data));
  await redis.expire(key, expire);
}

export async function getRemaining(cmd: string, member: GuildMember) {
  const key = `cd:${cmd}:${member.user.id}`;
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
  member: GuildMember | string,
): Promise<CooldownResponseValid | CooldownResponseInvalid> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const responseCooldown = await redis.exists(`cd:response:${id}`);

  if (responseCooldown) return { respond: false };
  else await redis.set(`cd:response:${id}`, "meow", "EX", 1);

  const key = `cd:${cmd}:${id}`;
  const cd: CooldownData = JSON.parse(await redis.get(key));

  if (!cd)
    return { respond: true, embed: new ErrorEmbed("you are on cooldown for `0.1s`").removeTitle() };

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

  if (remaining.includes("0.0") || remaining.includes("-")) {
    await redis.del(key);
    embed.setDescription("you are on cooldown for `0.1s`");
  }

  const random = Math.floor(Math.random() * 50);

  if (random == 7 && !(await isPremium(member))) {
    embed.setFooter({ text: "premium members get 50% shorter cooldowns (/premium)" });
  }

  return { respond: true, embed };
}

async function calculateCooldownLength(
  seconds: number,
  member: GuildMember | string,
): Promise<number> {
  const [premiumTier, booster, guildUpgrades, boosters] = await Promise.all([
    getTier(member),
    isBooster(typeof member === "string" ? member : member.user.id),
    getGuildUpgradesByUser(member),
    getBoosters(member),
  ]);

  let ms = seconds * 1000;

  if (premiumTier == 4) {
    ms = ms * 0.25;
  } else if (premiumTier > 0) {
    ms = ms * 0.5;
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
