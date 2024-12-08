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
  items?: string[]; // used for crates with specific items format: <id|role>:(value)
  crate_runs?: number; // how many times to do crate thing
  clicks?: number; // amount of clicks for scratch cards
  random_drop_chance?: number; // chance to appear in random drop pool
  tagId?: string;
  upgrades?: CarUpgradeType;
  plantId: string; // for seeds
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
