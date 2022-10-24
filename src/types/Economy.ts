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
