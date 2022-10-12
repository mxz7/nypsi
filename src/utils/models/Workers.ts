export interface Worker {
  name: string;
  id: string;
  item_emoji: string;
  prestige_requirement: number;
  cost: number;
  base: {
    per_item: number;
    max_storage: number;
    per_interval: number;
  };
}

export interface WorkerUpgrades {
  name: string;
  id: string;
  upgrades: PossibleUpgrade;
  effect: number; // decimal
  stack_limit: number;
  base_cost?: number;
}

enum PossibleUpgrade {
  PER_ITEM,
  PER_INTERVAL,
  MAX_STORAGE,
}
