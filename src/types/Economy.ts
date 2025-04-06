import { CarUpgradeType } from "@prisma/client";

export interface Item {
  id: string;
  name: string;
  emoji: string;
  shortDesc?: string;
  longDesc: string;
  buy?: number;
  sell?: number;
  role: string;
  default_count?: number;
  booster_desc?: string;
  aliases?: string[];
  speed?: number;
  rarity?: number;
  boobies?: string;
  ingot?: string;
  stackable?: boolean;
  max?: number;
  boosterEffect?: {
    boosts: string[];
    effect: number;
    time: number;
  };
  worker_upgrade_id?: string;
  plural?: string;
  article: string;
  craft?: {
    ingredients: string[]; // format: item_id:amount
    time: number; // seconds
  };
  in_crates: boolean;
  account_locked?: boolean;
  loot_pools?: {
    [pool: string]: number;
  }; // used for crates and scratches, indicates which pools to run and how many times
  clicks?: number; // amount of clicks for scratch cards
  tagId?: string;
  upgrades?: CarUpgradeType;
  plantId: string; // for seeds
  unique: boolean; // only allow one in world at a time
}

export interface LotteryTicket {
  userId: string;
  id: number;
}

export interface GuildUpgradeRequirements {
  money: number;
  xp: number;
  members: number;
}

export interface Booster {
  boosterId: string;
  expire: number;
  id: number;
}

export interface AchievementData {
  id: string;
  name: string;
  emoji: string;
  target: number;
  description: string;
  prize?: string[];
}

export interface BakeryUpgradeData {
  id: string;
  upgrades: "hourly" | "bake" | "maxafk" | "cake";
  name: string;
  emoji: string;
  value: number;
  max?: number;
}

export type GuildUpgrade = {
  id: string;
  name: string;
  description: string;
  cost: number;
  increment_per_level: number;
};

export type UserUpgrade = {
  id: string;
  name: string;
  description: string;
  chance: number;
  max: number;
  effect: number;
};

type BannedCache = {
  banned: true;
  bannedAccount: string;
  expire: number;
};

type NotBannedCache = {
  banned: false;
};

export type BanCache = BannedCache | NotBannedCache;

export type Plant = {
  id: string;
  name: string;
  growthTime: number;
  hourly: number;
  max: number;
  item: string;
  type: string; // tree / plant etc
  type_plural: string;
  water: {
    every: number;
    dead: number;
  };
  fertilise: {
    every: number;
    dead: number;
  };
};

export type PlantUpgrade = {
  id: string;
  name: string;
  plural?: string;
  upgrades: string;
  effect: number;
  for?: string[]; // use if upgrade is only for select plants
  type_single?: {
    stack_limit: number;
    item: string;
  };
  type_upgradable?: {
    items: string[];
  };
};
