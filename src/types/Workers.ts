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
    byproducts?: {
      [item: string]: {
        chance: number;
        rolls: number;
        multiply_chance: boolean;
        multiply_rolls: boolean;
      };
    };
  };
}

export interface WorkerUpgrades {
  name: string;
  plural?: string;
  id: string;
  upgrades: PossibleUpgrade;
  effect: number; // decimal
  stack_limit: number;
  base_cost?: number;
  for?: string;
  byproduct?: string;
}

export interface WorkerByproducts {
  [item: string]: number;
}

export type PossibleUpgrade =
  | "per_item"
  | "per_interval"
  | "max_storage"
  | "byproduct_chance"
  | "byproduct_rolls";

export type SteveData = {
  money: number;
  byproducts: {
    [index: string]: number;
  };
};
