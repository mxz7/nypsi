export interface Item {
  id: string;
  name: string;
  emoji: string;
  shortDesc?: string;
  longDesc: string;
  buy?: number;
  sell?: number;
  role?: string;
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
  worker_upgrade_id: string;
  plural?: string;
  craft?: {
    ingrediants: string[]; // format: item_id:amount
    time: number; // seconds
  };
  in_crates: boolean;
  account_locked?: boolean;
  items?: string[]; // used for crates with specific items format: <id|role>:(value)
  crate_runs?: number; // how many times to do crate thing
}

export interface LotteryTicket {
  userId: string;
  id: number;
}

export interface GuildUpgradeRequirements {
  money: number;
  xp: number;
}

export interface Booster {
  boosterId: string;
  expire: number;
  id: string;
}

export interface AchievementData {
  id: string;
  name: string;
  emoji: string;
  target: number;
  description: string;
  prize?: string;
}

export interface BakeryUpgradeData {
  id: string;
  upgrades: "hourly" | "bake" | "maxafk";
  name: string;
  emoji: string;
  value: number;
}
